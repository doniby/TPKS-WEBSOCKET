import { io } from "socket.io-client";

console.log("🔄 Connecting to server...");
const socket = io("http://10.130.0.240:3000", {
  query: { dashboard: "true" }
});

socket.on("connect", () => {
  console.log(`✅ Connected! Session ID: ${socket.id}`);
  console.log("⏳ Waiting for database events to broadcast...\n");
  
  // Optional: If you want to force the initial cache immediately without waiting
  // socket.emit("REQUEST_INITIAL_STATE", { eventNames: ["Your Event Name Here"] });
});

// This magic function catches ALL specific events broadcasted
socket.onAny((eventName, ...args) => {
  console.log("\n" + "=".repeat(50));
  console.log(`🔔 NEW EVENT: ${eventName}`);
  console.log("=".repeat(50));
  console.log(JSON.stringify(args[0], null, 2));
});

socket.on("disconnect", (reason) => {
  console.log(`❌ Disconnected: ${reason}`);
});

socket.on("connect_error", (err) => {
  console.log(`⚠️ Connection Error: ${err.message}`);
});
