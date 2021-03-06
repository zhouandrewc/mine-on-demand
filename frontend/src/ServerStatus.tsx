import React from 'react';
import Loader from './Loader';

const STATUS_ENDPOINT = "serverstatus.json";
const START_ENDPOINT = "start_server";

// Maximum amount of time to wait before timing out waiting for status
const STATUS_CHECK_TIMEOUT_MS = 120000;

enum ServerStateType {
  UNKNOWN_CHECKING = 0,   // Server state is unknown, we're checking
  ONLINE = 1,             // Server is known to be online
  OFFLINE = 2,            // Server is known to be offline
  STARTING = 3,           // Server is starting
  WAITING_FOR_ONLINE = 4, // We're waiting for the server to be online
}

interface ServerStatusProps {
  googleIDToken: string;
  onError: (msg: string) => void;
}

interface ServerStatusState {
  numPlayers: number;
  serverVersion?: string;
  serverState: ServerStateType;
  serverIPv4Addr?: string;
  serverHostname?: string;
  waitStartedAt?: Date;
}

class ServerStatus extends React.Component<ServerStatusProps, ServerStatusState> {
  constructor(props: Readonly<ServerStatusProps>) {
    super(props);
    this.state = {
      numPlayers: 0,
      serverVersion: undefined,
      serverState: ServerStateType.UNKNOWN_CHECKING,
    };
  }

  componentDidMount() {
    this.checkStatus(true);
  }

  async checkStatus(no_wait: boolean) {
    const response = await fetch(STATUS_ENDPOINT, {
      method: "GET",
      headers: new Headers({
        "Authorization": "Bearer " + this.props.googleIDToken,
      }),
    });

    if (response.status === 200) {
      try {
        const json = await response.json();
        if (json.online) {
          this.setState({
            serverState: ServerStateType.ONLINE,
            numPlayers: json.players,
            serverVersion: json.version,
            serverHostname: json.hostname,
            serverIPv4Addr: json.ipv4_addr
          });
        } else if (no_wait) {
          // Server was offline, and we're not waiting
          this.setState({ serverState: ServerStateType.OFFLINE });
        } else {
          // We are going to wait again
          this.scheduleNewWaitTimeout();
        }
      } catch (e) {
        this.props.onError("Unable to check the status of the server: " + e.message);
      }
    } else if (response.status === 403) {
      // This Google account isn't authorized to access the server
      this.props.onError("The Google account you're using isn't authorized to use the server.");
    } else {
      console.table(response);
      if (no_wait) {
        this.props.onError("Received a non-200 response. See console.");
      } else {
        this.scheduleNewWaitTimeout();
      }
    }
  }

  scheduleNewWaitTimeout() {
    if (!this.state.waitStartedAt) {
      this.props.onError("Tried to schedule new wait timeout but we're not waiting.");
      return;
    }
    if (new Date().getTime() - this.state.waitStartedAt.getTime() > STATUS_CHECK_TIMEOUT_MS) {
      // It's been more than the timeout threshold
      this.props.onError("We've been waiting a while. Something probably went wrong.");
      return;
    }
    console.log("Set new timeout of 10s");
    setTimeout(() => this.onWaitingTimerTick(), 10000);
  }

  async startServer() {
    this.setState({ serverState: ServerStateType.STARTING });

    const response = await fetch(START_ENDPOINT, {
      method: "POST",
      headers: new Headers({
        "Authorization": "Bearer " + this.props.googleIDToken,
      }),
    });

    if (response.status === 200) {
      // The instance has finished booting; now we need to wait until the app starts
      console.log("The server thinks the server has started.");
      this.setState({
        serverState: ServerStateType.WAITING_FOR_ONLINE,
        waitStartedAt: new Date(),
      });
      this.checkStatus(false);
    } else if (response.status === 409) {
      // The server was already running
      console.log("Received 409: Server was already running.");
      this.setState({
        serverState: ServerStateType.WAITING_FOR_ONLINE,
        waitStartedAt: new Date(),
      });
      this.checkStatus(false);
    } else {
      this.setState({ serverState: ServerStateType.OFFLINE });

      const bodyText = await response.text();
      this.props.onError("Unfortunately, the server failed to launch: " + bodyText);
      console.table(response);
    }
  }

  onRefreshButtonClick() {
    this.setState({ serverState: ServerStateType.UNKNOWN_CHECKING });
    this.checkStatus(true);
  }

  onStartServerClick() {
    this.startServer();
  }

  // Called by the waiting for online timer
  onWaitingTimerTick() {
    this.checkStatus(false);
  }

  render() {
    // Currently checking status
    if (this.state.serverState === ServerStateType.UNKNOWN_CHECKING) {
      return (
        <div>
          <p>Checking server status.</p>
          <Loader />
        </div>
      );
    }

    // Currently checking status until online
    if (this.state.serverState === ServerStateType.WAITING_FOR_ONLINE) {
      return (
        <div>
          <p>Waiting for server to come online.</p>
          <Loader />
        </div>
      );
    }

    // Refresh button
    const refreshButton = (
      <button
        onClick={() => this.onRefreshButtonClick()}
        className="tactile">
        Refresh
      </button>
    );

    // The server is online
    if (this.state.serverState === ServerStateType.ONLINE) {
      let onlineStr;
      if (this.state.numPlayers === 0) {
        onlineStr = "Nobody is";
      } else if (this.state.numPlayers === 1) {
        onlineStr = "One player is";
      } else {
        onlineStr = this.state.numPlayers + " players are";
      }
      return (
        <div>
          <p><span className="statusCircle green"></span> The server is online.</p>
          <p>
            {onlineStr} online and the version is {this.state.serverVersion}.
          </p>
          <div className="buttonBar">{refreshButton}</div>
          <div className="serverConnectionInfo">
            To connect to this server, use <strong>{this.state.serverHostname}</strong> as the host name.
            Can't connect? Make sure you are <a href="https://ipv6test.google.com/" rel="noopener noreferrer" target="_blank">on the IPv6 Internet</a>.
            Or, connect using IPv4: {this.state.serverIPv4Addr}
          </div>
        </div>
      );
    }

    // The server is starting
    if (this.state.serverState === ServerStateType.STARTING) {
      return (
        <div>
          <p>The server is starting. Wait patiently.</p>
          <Loader />
        </div>
      );
    }

    // The server is offline
    return (
      <div>
        <div><span className="statusCircle red"></span> The server is offline.</div>
        <div className="buttonBar">
        <button onClick={() => this.onStartServerClick()} className="tactile">Start Server</button>
          {refreshButton}
        </div>
      </div>
    );
  }
}

export default ServerStatus;
