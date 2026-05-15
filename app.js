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
  const DELETED_PLACES_KEY = "wheretoeat.deletedPlaceIds";
  let allPlaces = [];
  let deletedPlaceIds = loadDeletedPlaceIds();

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(String(s)).replace(/"/g, "&quot;");
  }

  function loadDeletedPlaceIds() {
    try {
      const raw = localStorage.getItem(DELETED_PLACES_KEY);
      const ids = JSON.parse(raw || "[]");
      return new Set(Array.isArray(ids) ? ids.filter(Boolean).map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveDeletedPlaceIds() {
    try {
      localStorage.setItem(
        DELETED_PLACES_KEY,
        JSON.stringify(Array.from(deletedPlaceIds))
      );
    } catch (_) {}
  }

  function appleDirectionsUrl(lat, lng) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }

  function googleDirectionsUrl(lat, lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }

  function yelpSearchUrl(findDesc, findLoc) {
    const p = new URLSearchParams();
    p.set("find_desc", findDesc);
    p.set("find_loc", (findLoc && String(findLoc).trim()) || "San Diego, CA");
    return "https://www.yelp.com/search?" + p.toString();
  }

  /** 无 url 时用标题/地址生成 Yelp 搜索（便于老店名也能跳转）。 */
  function resolvePlaceUrl(place) {
    const raw = (place.url || "").trim();
    if (raw) return raw;
    if (place.no_yelp) return "";
    let q = (place.query || place.title || "").trim();
    if (!q) return "";
    q = q.replace(/^#\d+\s*/, "").trim();
    const idx = q.indexOf("（");
    if (idx >= 0) q = q.slice(0, idx).trim();
    q = q.replace(/\s+/g, " ").slice(0, 120);
    if (!q) return "";
    const loc = (place.yelp_loc || "").trim() || "San Diego, CA";
    return yelpSearchUrl(q, loc);
  }

  function linkLabelForUrl(url) {
    try {
      const h = new URL(url).hostname;
      if (h.endsWith("yelp.com")) return "在 Yelp 打开";
    } catch (_) {}
    return "打开链接";
  }

  function navigationLinksHtml(place, lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    const label = encodeURIComponent(
      (place.title || place.query || "目的地").slice(0, 120)
    );
    const apple = appleDirectionsUrl(lat, lng);
    const google = googleDirectionsUrl(lat, lng);
    const gName = `https://www.google.com/maps/dir/?api=1&destination=${label}&travelmode=driving`;
    return (
      `<div class="popup-nav">` +
      `<span class="popup-nav-label">导航</span> ` +
      `<a class="popup-nav-link" href="${escapeHtml(
        apple
      )}" target="_blank" rel="noopener noreferrer">Apple 地图</a>` +
      `<span class="popup-nav-sep"> · </span>` +
      `<a class="popup-nav-link" href="${escapeHtml(
        google
      )}" target="_blank" rel="noopener noreferrer">Google 地图</a>` +
      `<span class="popup-nav-sep"> · </span>` +
      `<a class="popup-nav-link" href="${escapeHtml(
        gName
      )}" target="_blank" rel="noopener noreferrer">按名称</a>` +
      `</div>`
    );
  }

  function popupHtml(place) {
    const title = escapeHtml(place.title || "未命名");
    const url = resolvePlaceUrl(place);
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const placeId = place.id ? String(place.id) : "";
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

    const nav = navigationLinksHtml(place, lat, lng);

    const addressLink =
      place.query &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      `<div class="popup-meta"><a class="popup-address-link" href="${escapeHtml(
        appleDirectionsUrl(lat, lng)
      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        String(place.query).trim()
      )}</a></div>`;

    return (
      `${cover}` +
      `<div class="popup-title">${title}</div>` +
      (addressLink || "") +
      nav +
      (link ? `<div class="popup-link-row">${link}</div>` : "") +
      (placeId
        ? `<div class="popup-actions"><button type="button" class="popup-delete-btn" data-place-id="${escapeAttr(
            placeId
          )}" data-place-title="${escapeAttr(
            place.title || "这个地点"
          )}">删除此地点</button></div>`
        : "")
    );
  }

  function wireQuickNav(places) {
    const byId = {};
    for (const p of places) {
      if (p && p.id) byId[p.id] = p;
    }
    const leg = byId["attr-legoland-ca"];
    const air = byId["stay-airbnb-blue-lake"];
    const elL = document.getElementById("btn-nav-legoland");
    const elA = document.getElementById("btn-nav-airbnb");
    function setGoogleNavLink(el, p) {
      if (!el) return;
      if (!p) {
        el.hidden = true;
        return;
      }
      const la = Number(p.lat);
      const ln = Number(p.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) {
        el.hidden = true;
        return;
      }
      el.href = googleDirectionsUrl(la, ln);
      el.hidden = false;
    }
    setGoogleNavLink(elL, leg);
    setGoogleNavLink(elA, air);
  }

  function visiblePlaces() {
    return allPlaces.filter(function (p) {
      return !p.id || !deletedPlaceIds.has(String(p.id));
    });
  }

  function updateRestoreButton() {
    const btn = document.getElementById("btn-restore-places");
    if (btn) btn.hidden = deletedPlaceIds.size === 0;
  }

  function renderPlaces() {
    const places = visiblePlaces();
    addPlaceMarkers(places);
    wireQuickNav(places);
    updateRestoreButton();
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

  function deletePlace(placeId, title) {
    if (!placeId) return;
    const label = title || "这个地点";
    if (!confirm(`确定要删除「${label}」吗？此操作只会影响当前浏览器。`)) {
      return;
    }
    deletedPlaceIds.add(String(placeId));
    saveDeletedPlaceIds();
    map.closePopup();
    renderPlaces();
  }

  function restoreDeletedPlaces() {
    if (deletedPlaceIds.size === 0) return;
    deletedPlaceIds = new Set();
    saveDeletedPlaceIds();
    renderPlaces();
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
  document
    .getElementById("btn-restore-places")
    .addEventListener("click", restoreDeletedPlaces);
  document.addEventListener("click", function (event) {
    const btn = event.target.closest(".popup-delete-btn");
    if (!btn) return;
    deletePlace(btn.dataset.placeId, btn.dataset.placeTitle);
  });

  function applyPlacesData(data) {
    allPlaces = Array.isArray(data.places) ? data.places : [];
    renderPlaces();
    setTimeout(function () {
      map.invalidateSize();
    }, 0);
  }

  async function loadPlaces() {
    let data = null;

    try {
      const res = await fetch("data/places.json", { cache: "no-store" });
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    if (
      !data &&
      window.__PLACES_EMBED__ &&
      Array.isArray(window.__PLACES_EMBED__.places)
    ) {
      data = window.__PLACES_EMBED__;
    }

    if (!data) {
      alert(
        "无法加载地点数据。请用 https 打开本页，或运行 python3 scripts/embed_places.py 后重新部署。"
      );
      return;
    }

    applyPlacesData(data);
  }

  window.addEventListener("orientationchange", function () {
    setTimeout(function () {
      map.invalidateSize();
    }, 200);
  });

  loadPlaces();
})();
