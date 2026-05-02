(function () {
  const SD_CENTER = [32.7157, -117.1611];
  const DEFAULT_ZOOM = 11;

  const map = L.map("map", {
    tap: false,
  }).setView(SD_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);
  let userMarker = null;

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function yelpSearchUrl(findDesc) {
    const p = new URLSearchParams();
    p.set("find_desc", findDesc);
    p.set("find_loc", "San Diego, CA");
    return "https://www.yelp.com/search?" + p.toString();
  }

  /** 无 url 时用标题/地址生成 Yelp 搜索（便于老店名也能跳转）。 */
  function resolvePlaceUrl(place) {
    const raw = (place.url || "").trim();
    if (raw) return raw;
    let q = (place.query || place.title || "").trim();
    if (!q) return "";
    q = q.replace(/^#\d+\s*/, "").trim();
    const idx = q.indexOf("（");
    if (idx >= 0) q = q.slice(0, idx).trim();
    q = q.replace(/\s+/g, " ").slice(0, 120);
    if (!q) return "";
    return yelpSearchUrl(q);
  }

  function linkLabelForUrl(url) {
    try {
      const h = new URL(url).hostname;
      if (h.endsWith("yelp.com")) return "在 Yelp 打开";
    } catch (_) {}
    return "打开链接";
  }

  function popupHtml(place) {
    const title = escapeHtml(place.title || "未命名");
    const url = resolvePlaceUrl(place);
    const query = place.query ? escapeHtml(place.query) : "";
    const cover =
      place.cover && String(place.cover).trim()
        ? `<img class="popup-cover" src="${escapeHtml(
            String(place.cover).trim()
          )}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : "";

    const link =
      url &&
      `<a class="popup-link" href="${escapeHtml(
        url
      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        linkLabelForUrl(url)
      )}</a>`;

    return (
      `${cover}` +
      `<div class="popup-title">${title}</div>` +
      (query ? `<div class="popup-meta">${query}</div>` : "") +
      (link || "")
    );
  }

  function addPlaceMarkers(places) {
    markersLayer.clearLayers();
    const bounds = [];

    for (const p of places) {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const m = L.marker([lat, lng]);
      m.bindPopup(popupHtml(p), { maxWidth: 320 });
      markersLayer.addLayer(m);
      bounds.push([lat, lng]);
    }

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }

  function setUserLocation(lat, lng) {
    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    userMarker = L.circleMarker([lat, lng], {
      radius: 10,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);
    userMarker.bindPopup("当前位置").openPopup();
  }

  function locateMe() {
    if (!navigator.geolocation) {
      alert("当前浏览器不支持定位。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation(latitude, longitude);
        map.setView([latitude, longitude], Math.max(map.getZoom(), 13));
      },
      () => {
        alert(
          "无法获取位置。iPhone：设置 → 隐私与安全性 → 定位服务 → Safari 网站，允许；页面需通过 HTTPS 或本地 http:// 访问（不要离线 file://）。"
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  document.getElementById("btn-locate").addEventListener("click", locateMe);

  function applyPlacesData(data, status, sourceLabel) {
    const places = Array.isArray(data.places) ? data.places : [];
    const missing = places.filter(
      (p) =>
        !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))
    );
    addPlaceMarkers(places);
    setTimeout(function () {
      map.invalidateSize();
    }, 0);
    let msg = `已加载 ${places.length} 个地点${sourceLabel ? "（" + sourceLabel + "）" : ""}。`;
    if (missing.length) {
      msg += ` 其中 ${missing.length} 条缺坐标，可运行 python3 scripts/geocode_places.py。`;
    }
    status.textContent = msg;
  }

  async function loadPlaces() {
    const status = document.getElementById("load-status");
    let data = null;
    let sourceLabel = "";

    try {
      const res = await fetch("data/places.json", { cache: "no-store" });
      if (res.ok) {
        data = await res.json();
        sourceLabel = "places.json";
      }
    } catch (_) {}

    if (
      !data &&
      window.__PLACES_EMBED__ &&
      Array.isArray(window.__PLACES_EMBED__.places)
    ) {
      data = window.__PLACES_EMBED__;
      sourceLabel = "内嵌数据";
    }

    if (!data) {
      status.textContent =
        "无法加载地点：请用 http(s) 打开本页，或运行 python3 scripts/embed_places.py 生成 embedded-places.js。";
      return;
    }

    applyPlacesData(data, status, sourceLabel);
  }

  window.addEventListener("orientationchange", function () {
    setTimeout(function () {
      map.invalidateSize();
    }, 200);
  });

  loadPlaces();
})();
