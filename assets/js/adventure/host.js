import { deriveDirectionFromVector } from "./rooms.js";

export function createHostBridge(store, ui, rooms) {
  let controller = null;
  const isStandalone = window.parent === window;
  let standaloneTimer = null;
  let standaloneActive = false;

  function setController(api) {
    controller = api;
  }

  function postToHost(payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, "*");
    }
  }

  function requestState() {
    postToHost({ type: "origamiRequestState" });
  }

  function notifyReady() {
    postToHost({ type: "origamiClientReady", role: "adventure" });
    postToHost({
      type: "origamiAdventureBuild",
      signature: document.lastModified,
      reason: "load",
      href: window.location.href,
    });
  }

  function handleMove(direction) {
    postToHost({ type: "origamiRequestMove", direction });
  }

  function bindListeners() {
    window.addEventListener("message", (event) => {
      const { data } = event;
      if (!data || typeof data !== "object") return;
      if (data.type?.startsWith("origami")) {
        stopStandaloneDemo();
      }
      if (data.type === "origamiStateSync") {
        store.state.host.dungeon = data.state?.dungeon || null;
        store.state.host.player = data.state?.player || null;
        controller?.syncEnvironment(data.state);
        return;
      }
      if (data.type === "origamiRoomEntered") {
        controller?.handleRoomEntered(data.room, data.timestamp);
        return;
      }
      if (data.type === "origamiLootDrop") {
        controller?.handleLootDrop(data.loot);
        return;
      }
    });
  }

  function start() {
    bindListeners();
    notifyReady();
    requestState();
    if (isStandalone) {
      window.setTimeout(() => {
        if (!standaloneActive) bootstrapStandaloneDemo();
      }, 600);
    }
  }

  function bootstrapStandaloneDemo() {
    standaloneActive = true;
    const room = rooms.createEntranceHallway();
    controller?.handleRoomEntered(
      {
        id: room.id,
        size: { w: 1, h: 5 },
        hallway: true,
      },
      Date.now()
    );
    ui.logText(
      "Signals from the origami host are offline, so a paper hallway unfolds before you."
    );
    const scriptedEvents = [
      () =>
        ui.logText(
          "A voice whispers: 'Your journey begins. Use the guide buttons or type commands to move forward.'"
        ),
    ];
    let step = 0;
    standaloneTimer = window.setInterval(() => {
      const action = scriptedEvents[step];
      if (action) action();
      step += 1;
      if (step >= scriptedEvents.length) {
        stopStandaloneDemo();
      }
    }, 3500);
  }

  function stopStandaloneDemo() {
    if (!standaloneActive) return;
    standaloneActive = false;
    if (standaloneTimer) {
      window.clearInterval(standaloneTimer);
      standaloneTimer = null;
    }
  }

  return {
    start,
    handleMove,
    setController,
    requestState,
    postToHost,
    stopStandaloneDemo,
    bindListeners,
  };
}
