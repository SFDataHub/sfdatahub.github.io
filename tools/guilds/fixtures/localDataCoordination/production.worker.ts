import { installPeer } from "./production";
installPeer("worker");
postMessage("ready");
