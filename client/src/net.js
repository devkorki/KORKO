import { io } from "socket.io-client";
import { EVENTS } from "../../shared/protocol.js";

export function connect(serverUrl) {
  const socket = io(serverUrl, { transports: ["websocket"] });
  return {
    socket,
    on: (event, fn) => socket.on(event, fn),
    emit: (event, payload) => socket.emit(event, payload),
    EVENTS
  };
}
