(function () {
  "use strict";

  const data = window.JOURNEY_DATA;
  const fallback = document.getElementById("mapFallback");

  if (!window.L || !data) {
    fallback.classList.add("is-visible");
    return;
  }

  const initialArrived = new Set(data.initialArrivedIds);
  const state = loadState();
  let showPlanned = true;
  let map;
  let markerLayer;
  let routeLayer;
  let mysteryLayer;
  const markerById = new Map();

  initialiseMap();
  renderAll();
  bindControls();

  function loadState() {
    const base = {
      currentId: data.initialCurrentId,
      arrivedIds: [...data.initialArrivedIds]
    };

    try {
      const saved = JSON.parse(localStorage.getItem(data.storageKey));
      if (!saved || !Array.isArray(saved.arrivedIds)) return base;

      const validIds = new Set(data.locations.map((location) => location.id));
      const arrivedIds = saved.arrivedIds.filter((id) => validIds.has(id));
      const currentId = validIds.has(saved.currentId) ? saved.currentId : data.initialCurrentId;

      return {
        currentId,
        arrivedIds: [...new Set([...data.initialArrivedIds, ...arrivedIds])]
      };
    } catch {
      return base;
    }
  }

  function saveState() {
    localStorage.setItem(data.storageKey, JSON.stringify(state));
  }

  function initialiseMap() {
    map = L.map("map", {
      zoomControl: false,
      minZoom: 9,
      maxZoom: 18,
      preferCanvas: true
    }).setView(data.view.center, data.view.zoom);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\" rel=\"noopener noreferrer\">国土地理院</a>"
    }).addTo(map);

    L.control.scale({
      position: "bottomleft",
      imperial: false,
      maxWidth: 140
    }).addTo(map);

    mysteryLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    map.whenReady(() => {
      fallback.classList.remove("is-visible");
      window.setTimeout(() => map.invalidateSize(), 120);
    });
  }

  function renderAll(options = {}) {
    markerLayer.clearLayers();
    routeLayer.clearLayers();
    mysteryLayer.clearLayers();
    markerById.clear();

    renderMysteries();
    renderRoutes();
    renderMarkers();
    renderSidebar();
    renderHeader();

    if (options.openId) {
      const marker = markerById.get(options.openId);
      if (marker) marker.openPopup();
    }
  }

  function renderMysteries() {
    (data.mysteries || []).forEach((mystery) => {
      const area = L.circle(mystery.coordinates, {
        radius: mystery.radiusMeters,
        color: "#9d6a5d",
        weight: 2,
        opacity: 0.8,
        fillColor: "#eee9df",
        fillOpacity: 0.34,
        dashArray: "7 9",
        interactive: true
      });

      const marker = L.marker(mystery.coordinates, {
        icon: L.divIcon({
          className: "map-icon-wrap",
          html: "<div class=\"mystery-marker\" aria-hidden=\"true\">?</div>",
          iconSize: [46, 46],
          iconAnchor: [23, 23],
          popupAnchor: [0, -22]
        }),
        keyboard: true,
        title: mystery.name,
        zIndexOffset: 500
      });

      const popup = `
        <article class="popup-card popup-card--mystery">
          <div class="popup-kicker">UNIT 02 · 未确认区域</div>
          <h3>${escapeHtml(mystery.name)}</h3>
          <div class="popup-coordinate">${escapeHtml(mystery.coordinateNote)}</div>
          <p>${escapeHtml(mystery.summary)}</p>
          <blockquote>${escapeHtml(mystery.quote)}</blockquote>
        </article>
      `;

      area.bindTooltip(`${mystery.name} · 大致范围`, {
        sticky: true,
        className: "story-tooltip"
      });
      area.bindPopup(popup, {
        className: "story-popup",
        maxWidth: 330,
        minWidth: 260,
        closeButton: true
      });
      marker.bindTooltip(mystery.name, {
        direction: "top",
        offset: [0, -18],
        className: "story-tooltip"
      });
      marker.bindPopup(popup, {
        className: "story-popup",
        maxWidth: 330,
        minWidth: 260,
        closeButton: true
      });

      area.addTo(mysteryLayer);
      marker.addTo(mysteryLayer);
    });
  }

  function renderRoutes() {
    const arrived = new Set(state.arrivedIds);

    data.routeSegments.forEach((segment) => {
      const completed = arrived.has(segment.to);
      if (!completed && !showPlanned) return;

      const underlay = L.polyline(segment.coordinates, {
        color: "#f4efe5",
        weight: completed ? 10 : 8,
        opacity: 0.9,
        interactive: false
      });

      const line = L.polyline(segment.coordinates, {
        color: completed ? "#265e78" : "#b66b55",
        weight: completed ? 6 : 4,
        opacity: completed ? 0.96 : 0.72,
        dashArray: completed ? null : "10 13",
        lineCap: "round",
        lineJoin: "round"
      });

      underlay.addTo(routeLayer);
      line.addTo(routeLayer);
    });
  }

  function renderMarkers() {
    const arrived = new Set(state.arrivedIds);

    data.locations.forEach((location) => {
      const status = getStatus(location, arrived);
      if (status === "planned" && !showPlanned) return;

      const marker = L.marker(location.coordinates, {
        icon: makeIcon(location, status),
        keyboard: true,
        title: location.name,
        zIndexOffset: status === "current" ? 1200 : status === "planned" ? 700 : 900
      });

      marker.bindTooltip(location.shortName, {
        direction: "top",
        offset: [0, -20],
        className: "story-tooltip"
      });

      marker.bindPopup(makePopup(location, status), {
        className: "story-popup",
        maxWidth: 330,
        minWidth: 260,
        closeButton: true
      });

      marker.addTo(markerLayer);
      markerById.set(location.id, marker);
    });
  }

  function makeIcon(location, status) {
    if (status === "memory") {
      return L.divIcon({
        className: "map-icon-wrap",
        html: "<div class=\"memory-marker\" aria-hidden=\"true\"><span></span><span></span></div>",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
        popupAnchor: [0, -20]
      });
    }

    if (status === "planned") {
      return L.divIcon({
        className: "map-icon-wrap",
        html: `<div class="planned-marker" aria-hidden="true"><span>☆</span><b>${pad(location.order)}</b></div>`,
        iconSize: [58, 58],
        iconAnchor: [29, 29],
        popupAnchor: [0, -28]
      });
    }

    return L.divIcon({
      className: "map-icon-wrap",
      html: `
        <div class="arrival-marker ${status === "current" ? "is-current" : ""}" aria-hidden="true">
          <div class="pair-dots"><i></i><em></em></div>
          <b>${pad(location.order)}</b>
        </div>
      `,
      iconSize: [62, 62],
      iconAnchor: [31, 31],
      popupAnchor: [0, -30]
    });
  }

  function makePopup(location, status) {
    const tags = Array.isArray(location.events)
      ? location.events.map((event) => `<span>${escapeHtml(event)}</span>`).join("")
      : "";
    const statusLabel = {
      memory: "过去的据点",
      visited: "两人已到达",
      current: "当前所在地",
      planned: "计划地点"
    }[status];

    let action = "";
    if (status === "planned") {
      action = `<button class="popup-action" data-arrive="${location.id}">标记两人抵达</button>`;
    } else if (!initialArrived.has(location.id) && status === "current") {
      action = `<button class="popup-action popup-action--quiet" data-unarrive="${location.id}">撤销本次抵达</button>`;
    }

    const source = location.sourceUrl
      ? `<a class="popup-source" href="${location.sourceUrl}" target="_blank" rel="noreferrer">在高德地图中查看 ↗</a>`
      : "";

    return `
      <article class="popup-card">
        <div class="popup-kicker">${escapeHtml(location.unit)} · ${statusLabel}</div>
        <h3>${escapeHtml(location.name)}</h3>
        <div class="popup-coordinate">${escapeHtml(location.coordinateNote)}</div>
        <p>${escapeHtml(location.summary)}</p>
        ${tags ? `<div class="popup-tags">${tags}</div>` : ""}
        <blockquote>${escapeHtml(location.quote)}</blockquote>
        ${source}
        ${action}
      </article>
    `;
  }

  function renderSidebar() {
    const list = document.getElementById("journeyList");
    const arrived = new Set(state.arrivedIds);
    const journeyLocations = data.locations.filter((location) => location.kind === "journey");

    list.innerHTML = journeyLocations.map((location) => {
      const status = getStatus(location, arrived);
      const statusText = status === "current" ? "当前" : status === "visited" ? "抵达" : "计划";
      return `
        <li>
          <button type="button" class="journey-item journey-item--${status}" data-focus="${location.id}">
            <span class="journey-item__index">${pad(location.order)}</span>
            <span class="journey-item__body">
              <strong>${escapeHtml(location.shortName)}</strong>
              <small>${escapeHtml(location.unit)} · ${statusText}</small>
            </span>
            <span class="journey-item__mark">${status === "planned" ? "○" : "●"}</span>
          </button>
        </li>
      `;
    }).join("");

    const arrivedCount = journeyLocations.filter((location) => arrived.has(location.id)).length;
    document.getElementById("progressCount").textContent = `${arrivedCount} / ${journeyLocations.length}`;
  }

  function renderHeader() {
    const current = getLocation(state.currentId) || getLocation(data.initialCurrentId);
    const previous = getPreviousArrived(current);
    const latestEvent = Array.isArray(current.events) ? current.events.at(-1) : "";
    const currentLabel = current.currentLabel || latestEvent;

    document.getElementById("currentName").textContent = current.name;
    document.getElementById("currentMeta").textContent = [current.unit, currentLabel]
      .filter(Boolean)
      .join(" · ");
    document.getElementById("routeCaption").textContent = previous
      ? `${previous.shortName} → ${current.shortName}`
      : current.shortName;
  }

  function getPreviousArrived(current) {
    const arrived = new Set(state.arrivedIds);
    return [...data.locations]
      .filter((location) => location.kind === "journey" && arrived.has(location.id) && location.order < current.order)
      .sort((a, b) => b.order - a.order)[0];
  }

  function getStatus(location, arrived = new Set(state.arrivedIds)) {
    if (location.kind === "memory") return "memory";
    if (location.id === state.currentId) return "current";
    if (arrived.has(location.id)) return "visited";
    return "planned";
  }

  function bindControls() {
    document.addEventListener("click", (event) => {
      const arrivalButton = event.target.closest("[data-arrive]");
      if (arrivalButton) {
        markArrived(arrivalButton.dataset.arrive);
        return;
      }

      const undoButton = event.target.closest("[data-unarrive]");
      if (undoButton) {
        undoArrival(undoButton.dataset.unarrive);
        return;
      }

      const focusButton = event.target.closest("[data-focus]");
      if (focusButton) {
        focusLocation(focusButton.dataset.focus);
      }
    });

    document.getElementById("locateCurrent").addEventListener("click", () => {
      focusLocation(state.currentId);
    });

    document.getElementById("fitJourney").addEventListener("click", () => {
      collapseSidebarForMap();
      fitJourney();
    });

    document.getElementById("togglePlanned").addEventListener("click", (event) => {
      showPlanned = !showPlanned;
      event.currentTarget.setAttribute("aria-pressed", String(!showPlanned));
      event.currentTarget.textContent = showPlanned ? "隐藏计划地点" : "显示计划地点";
      renderAll();
    });

    document.getElementById("resetProgress").addEventListener("click", () => {
      state.currentId = data.initialCurrentId;
      state.arrivedIds = [...data.initialArrivedIds];
      saveState();
      renderAll();
      fitJourney();
    });

    const toggle = document.getElementById("sidebarToggle");
    toggle.addEventListener("click", () => {
      const collapsed = document.body.classList.toggle("sidebar-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      window.setTimeout(() => map.invalidateSize(), 260);
    });

    window.addEventListener("resize", () => map.invalidateSize());
  }

  function markArrived(id) {
    const location = getLocation(id);
    if (!location || location.kind !== "journey") return;

    state.arrivedIds = [...new Set([...state.arrivedIds, id])];
    state.currentId = id;
    saveState();
    renderAll({ openId: id });
    map.flyTo(location.coordinates, 13, { duration: 0.8 });
  }

  function undoArrival(id) {
    if (initialArrived.has(id)) return;

    state.arrivedIds = state.arrivedIds.filter((arrivedId) => arrivedId !== id);
    const previous = [...data.locations]
      .filter((location) => location.kind === "journey" && state.arrivedIds.includes(location.id))
      .sort((a, b) => b.order - a.order)[0];

    state.currentId = previous ? previous.id : data.initialCurrentId;
    saveState();
    renderAll();
    focusLocation(state.currentId);
  }

  function focusLocation(id) {
    const location = getLocation(id);
    if (!location) return;

    if (!showPlanned && getStatus(location) === "planned") {
      showPlanned = true;
      const toggle = document.getElementById("togglePlanned");
      toggle.setAttribute("aria-pressed", "false");
      toggle.textContent = "隐藏计划地点";
      renderAll();
    }

    collapseSidebarForMap();
    map.flyTo(location.coordinates, location.kind === "memory" ? 14 : 13, { duration: 0.75 });
    window.setTimeout(() => {
      const marker = markerById.get(id);
      if (marker) marker.openPopup();
    }, 650);
  }

  function collapseSidebarForMap() {
    if (!window.matchMedia("(max-width: 880px)").matches) return;

    document.body.classList.add("sidebar-collapsed");
    document.getElementById("sidebarToggle").setAttribute("aria-expanded", "false");
  }

  function fitJourney() {
    const visibleLocations = data.locations.filter((location) => {
      return showPlanned || getStatus(location) !== "planned";
    });
    const bounds = L.latLngBounds(visibleLocations.map((location) => location.coordinates));
    (data.mysteries || []).forEach((mystery) => {
      bounds.extend(L.circle(mystery.coordinates, { radius: mystery.radiusMeters }).getBounds());
    });
    map.fitBounds(bounds, {
      paddingTopLeft: [54, 54],
      paddingBottomRight: [54, 54],
      maxZoom: 12
    });
  }

  function getLocation(id) {
    return data.locations.find((location) => location.id === id);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
