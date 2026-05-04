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
      (link ? `<div class="popup-link-row">${link}</div>` : "")
    );
  }

  function openNavPicker(lat, lng) {
    const root = document.getElementById("nav-picker");
    if (!root) return;
    root.dataset.lat = String(lat);
    root.dataset.lng = String(lng);
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
  }

  function closeNavPicker() {
    const root = document.getElementById("nav-picker");
    if (!root) return;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    delete root.dataset.lat;
    delete root.dataset.lng;
  }

  function wireNavPicker() {
    const root = document.getElementById("nav-picker");
    if (!root) return;
    const appleBtn = document.getElementById("nav-picker-apple");
    const googleBtn = document.getElementById("nav-picker-google");
    const cancelBtn = document.getElementById("nav-picker-cancel");
    const backdrop = root.querySelector(".nav-picker-backdrop");
    function openChosen(buildUrl) {
      const la = parseFloat(root.dataset.lat || "", 10);
      const ln = parseFloat(root.dataset.lng || "", 10);
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        window.open(buildUrl(la, ln), "_blank", "noopener,noreferrer");
      }
      closeNavPicker();
    }
    if (appleBtn) {
      appleBtn.onclick = function () {
        openChosen(appleDirectionsUrl);
      };
    }
    if (googleBtn) {
      googleBtn.onclick = function () {
        openChosen(googleDirectionsUrl);
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = closeNavPicker;
    }
    if (backdrop) {
      backdrop.onclick = closeNavPicker;
    }
  }

  function wireQuickNav(places) {
    const byId = {};
    for (const p of places) {
      if (p && p.id) byId[p.id] = p;
    }
    const leg = byId["attr-legoland-ca"];
    const air = byId["stay-airbnb-blue-lake"];
    const btnL = document.getElementById("btn-nav-legoland");
    const btnA = document.getElementById("btn-nav-airbnb");
    function go(p) {
      if (!p) return;
      const la = Number(p.lat);
      const ln = Number(p.lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      openNavPicker(la, ln);
    }
    if (btnL) {
      btnL.onclick = function () {
        go(leg);
      };
    }
    if (btnA) {
      btnA.onclick = function () {
        go(air);
      };
    }
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
  wireNavPicker();

  function applyPlacesData(data) {
    const places = Array.isArray(data.places) ? data.places : [];
    addPlaceMarkers(places);
    wireQuickNav(places);
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
