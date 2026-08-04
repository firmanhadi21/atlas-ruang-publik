import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

declare const __BUILD_TIME__: string;

const R_SALES = 200;
const R_ADS = 500;
const REPO = "https://github.com/firmanhadi21/atlas-ruang-publik";

type Ringkasan = {
  total_sekolah: number;
  sekolah_dalam_200m: number;
  persen_sekolah: number;
  median_jarak_m: number;
  total_minimarket: number;
  minimarket_dalam_200m: number;
  persen_minimarket: number;
  /** 表示できる点の数。Google Places 由来は再配布不可なので統計の母数より少ない。 */
  minimarket_ditampilkan: number;
  kecamatan: { nama: string; sekolah: number; kena: number; persen: number | null; toko: number }[];
};

// ★ new URL(..., import.meta.url) は使わない。テンプレートリテラルだと Vite が静的解析
//   できず実行時に **assets/ からの相対**で解決され、data/ が 404 になる（実際に踏んだ）。
//   BASE_URL はビルド時に base（/food-store-master/semarang/）へ置換される。
const url = (p: string) => `${import.meta.env.BASE_URL}data/${p}`;
const nf = (n: number) => n.toLocaleString("id-ID");

/* ---- 基図 ----
   日本版は地理院タイルだが国外を覆わないため使えない。無償・APIキー不要・
   帰属表示だけで使えるものから3種を用意する。

   ★ Google Maps は入れられない。Google Maps Platform の規約は Google のコンテンツを
     **Google 以外の地図上に表示すること**を禁じており、タイル URL を MapLibre に
     直接差すのは規約違反になる。合法にやるには Maps JavaScript API に載せ替える必要が
     あり、そうすると (1) API キーをクライアントに露出、(2) 地図表示ごとに課金＝
     拡散したときほど請求が増える、(3) データを再配布できず第三者による検証が不可能、
     という3つの不利益が生じる。行政向けの資料としては割に合わないので採らない。
     衛星画像が要る用途には Esri World Imagery を代わりに入れている。 */
type Basemap = { tiles: string[]; attr: string; note: string; maxzoom?: number };
const BASEMAPS: Record<string, Basemap> = {
  terang: {
    tiles: ["a", "b", "c"].map(
      (s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`,
    ),
    attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    note: "Peta polos — paling mudah membaca titik dan radius.",
  },
  detail: {
    tiles: ["a", "b", "c"].map(
      (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`,
    ),
    attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    note: "Menampilkan nama jalan dan tempat — berguna untuk mengenali lokasi.",
  },
  satelit: {
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attr: 'Citra: <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    note: "Citra satelit — untuk memeriksa keadaan sebenarnya di lapangan.",
    maxzoom: 19,
  },
};
let activeBm = "terang";

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: Object.fromEntries(
      Object.entries(BASEMAPS).map(([k, b]) => [
        `bm-${k}`,
        { type: "raster", tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom ?? 20 },
      ]),
    ),
    // ★ setStyle で差し替えず、3枚とも読み込んで visibility を切り替える。
    //   setStyle だと重ねたレイヤを毎回追加し直す必要があり（日本版の落とし穴）、
    //   ラスタ↔ラスタなら表示切替のほうが確実で速い。
    layers: Object.keys(BASEMAPS).map((k) => ({
      id: `bm-${k}`,
      type: "raster" as const,
      source: `bm-${k}`,
      layout: { visibility: k === activeBm ? ("visible" as const) : ("none" as const) },
    })),
  },
  center: [110.4229, -6.9932], // Simpang Lima
  zoom: 11.6,
  maxZoom: 18,
  attributionControl: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// 帰属は基図ごとに違うので、切り替えのたびに付け替える。
// （style 内の全ソースの attribution をまとめて出すと、非表示の基図の帰属まで出てしまう）
let attribCtl: maplibregl.AttributionControl | null = null;
function setAttribution(bm: string) {
  if (attribCtl) map.removeControl(attribCtl);
  attribCtl = new maplibregl.AttributionControl({
    compact: true,
    customAttribution: `${BASEMAPS[bm].attr} · Sekolah: OSM/Dukcapil · Minimarket: Overture/OSM`,
  });
  map.addControl(attribCtl, "bottom-right");
}
setAttribution(activeBm);
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

/** 選択した学校の 200m / 500m 円を描くための多角形を作る。
 *  緯度 -7 度の等距円筒近似。Semarang は cos(7°)≒0.9926 なのでほぼ等方。 */
function circle(lon: number, lat: number, meters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = meters / 111320;
  const dLon = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
let sekolahData: GeoJSON.FeatureCollection | null = null;

map.on("load", async () => {
  const [sekolah, toko, kec, ring] = await Promise.all([
    fetch(url("sekolah.geojson")).then((r) => r.json()),
    fetch(url("minimarket.geojson")).then((r) => r.json()),
    fetch(url("kecamatan.geojson")).then((r) => r.json()),
    fetch(url("ringkasan.json")).then((r) => r.json() as Promise<Ringkasan>),
  ]);
  sekolahData = sekolah;

  map.addSource("kec", { type: "geojson", data: kec });
  map.addSource("toko", { type: "geojson", data: toko });
  map.addSource("sekolah", { type: "geojson", data: sekolah });
  map.addSource("radius", { type: "geojson", data: empty });

  // --- 行政界（既定は非表示） ---
  map.addLayer({
    id: "kec-line", type: "line", source: "kec",
    layout: { visibility: "none" },
    paint: { "line-color": "#8a94a2", "line-width": 1, "line-dasharray": [3, 2] },
  });

  // --- 選択した学校の radius（塗り→線の順で店舗より下に置く） ---
  map.addLayer({
    id: "radius-500", type: "fill", source: "radius",
    filter: ["==", ["get", "r"], R_ADS],
    paint: { "fill-color": "#e8913a", "fill-opacity": 0.13 },
  });
  map.addLayer({
    id: "radius-200", type: "fill", source: "radius",
    filter: ["==", ["get", "r"], R_SALES],
    paint: { "fill-color": "#d1343c", "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: "radius-line", type: "line", source: "radius",
    paint: {
      "line-color": ["case", ["==", ["get", "r"], R_SALES], "#d1343c", "#e8913a"],
      "line-width": 1.6,
    },
  });

  // --- ミニマーケット ---
  map.addLayer({
    id: "toko", type: "circle", source: "toko",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 4, 17, 7],
      "circle-color": "#2a6fb0",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 14, 0.8],
      "circle-stroke-color": "#fff",
      "circle-opacity": 0.85,
    },
  });

  // --- 学校: 200m 圏内に店があるものを赤、無いものを緑 ---
  map.addLayer({
    id: "sekolah", type: "circle", source: "sekolah",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.4, 14, 6, 17, 10],
      "circle-color": ["case", [">", ["get", "n200"], 0], "#d1343c", "#2f7d4f"],
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "#fff",
    },
  });

  renderRingkasan(ring);
  document.getElementById("toko-n")!.textContent =
    `— ${nf(ring.minimarket_ditampilkan)} dari ${nf(ring.total_minimarket)} dapat ditampilkan`;
  wireUI();
});

function renderRingkasan(r: Ringkasan) {
  document.getElementById("ringkasan")!.innerHTML = `
    <div class="stat-big">${String(r.persen_minimarket).replace(".", ",")}<small>%</small></div>
    <p class="stat-cap"><b>${nf(r.minimarket_dalam_200m)} dari ${nf(r.total_minimarket)}
      minimarket</b> di Kota Semarang berada di dalam radius <b>200 m</b> dari satuan
      pendidikan — radius yang <b>dilarang menjual produk tembakau</b> oleh PP 28/2024.</p>
    <p class="stat-sub">Dilihat dari sisi sekolah:
      <b>${nf(r.sekolah_dalam_200m)} dari ${nf(r.total_sekolah)} satuan pendidikan
      (${String(r.persen_sekolah).replace(".", ",")}%)</b> memiliki minimarket dalam 200 m.<br />
      Jarak ke minimarket terdekat: median <b>${nf(r.median_jarak_m)} m</b> —
      praktis tepat di ambang aturan.</p>`;

  const rows = r.kecamatan
    .filter((k) => k.sekolah > 0)
    .sort((a, b) => (b.persen ?? 0) - (a.persen ?? 0));
  const max = Math.max(...rows.map((k) => k.persen ?? 0), 1);
  document.getElementById("tabel-kec")!.innerHTML =
    `<thead><tr><th>Kecamatan</th><th>Sekolah</th><th>&lt;200 m</th><th></th></tr></thead><tbody>` +
    rows
      .map(
        (k) => `<tr><td>${k.nama}</td><td>${k.sekolah}</td>
        <td><b>${String(k.persen ?? 0).replace(".", ",")}%</b></td>
        <td style="width:56px"><span class="bar" style="width:${
          ((k.persen ?? 0) / max) * 50
        }px"></span></td></tr>`,
      )
      .join("") +
    `</tbody>`;
}

function showRadius(lon: number, lat: number) {
  const f200 = circle(lon, lat, R_SALES);
  f200.properties = { r: R_SALES };
  const f500 = circle(lon, lat, R_ADS);
  f500.properties = { r: R_ADS };
  (map.getSource("radius") as maplibregl.GeoJSONSource).setData({
    type: "FeatureCollection",
    features: [f500, f200],
  });
}

function popup(lon: number, lat: number, p: Record<string, unknown>) {
  const n200 = Number(p.n200), n500 = Number(p.n500), dmin = Number(p.dmin);
  const hit = n200 > 0;
  new maplibregl.Popup({ offset: 12, maxWidth: "270px" })
    .setLngLat([lon, lat])
    .setHTML(
      `<div class="pop-nama">${p.nama}</div>
       <div class="pop-j">${p.jenjang}</div>
       <div class="pop-row">Dalam <b>200 m</b> (larangan jual):
         <span class="pop-n ${hit ? "pop-hit" : "pop-ok"}">${n200} minimarket</span></div>
       <div class="pop-row">Dalam <b>500 m</b> (larangan iklan):
         <span class="pop-n">${n500} minimarket</span></div>
       <div class="pop-row">Terdekat: <b>${nf(dmin)} m</b></div>`,
    )
    .addTo(map);
}

function wireUI() {
  // レイヤ切替
  const bind = (id: string, layers: string[]) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.addEventListener("change", () =>
      layers.forEach((l) =>
        map.setLayoutProperty(l, "visibility", el.checked ? "visible" : "none"),
      ),
    );
  };
  bind("l-sekolah", ["sekolah"]);
  bind("l-toko", ["toko"]);
  bind("l-kec", ["kec-line"]);

  // 基図切替
  const note = document.getElementById("bm-note")!;
  const seg = document.getElementById("basemap")!;
  const applyBm = (k: string) => {
    for (const key of Object.keys(BASEMAPS)) {
      map.setLayoutProperty(`bm-${key}`, "visibility", key === k ? "visible" : "none");
    }
    // 衛星画像の上では白フチが見えにくいので、点の縁を濃くする
    const dark = k === "satelit";
    map.setPaintProperty("sekolah", "circle-stroke-color", dark ? "#0b0d10" : "#fff");
    map.setPaintProperty("toko", "circle-stroke-color", dark ? "#0b0d10" : "#fff");
    map.setPaintProperty("kec-line", "line-color", dark ? "#e8ecf0" : "#8a94a2");
    activeBm = k;
    note.textContent = BASEMAPS[k].note;
    setAttribution(k);
    seg.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.bm === k;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  };
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b?.dataset.bm) applyBm(b.dataset.bm);
  });
  note.textContent = BASEMAPS[activeBm].note;

  // 学校クリック → radius + ポップアップ
  map.on("click", "sekolah", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    showRadius(lon, lat);
    popup(lon, lat, f.properties as Record<string, unknown>);
  });
  map.on("click", "toko", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    new maplibregl.Popup({ offset: 10 })
      .setLngLat([lon, lat])
      .setHTML(`<div class="pop-nama">${f.properties?.nama ?? "Minimarket"}</div>
                <div class="pop-j">Minimarket</div>`)
      .addTo(map);
  });
  for (const l of ["sekolah", "toko"]) {
    map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
  }

  // 検索
  const cari = document.getElementById("cari") as HTMLInputElement;
  const hasil = document.getElementById("hasil")!;
  cari.addEventListener("input", () => {
    const q = cari.value.trim().toLowerCase();
    hasil.innerHTML = "";
    if (q.length < 2 || !sekolahData) return;
    sekolahData.features
      .filter((f) => String(f.properties?.nama ?? "").toLowerCase().includes(q))
      .slice(0, 30)
      .forEach((f) => {
        const li = document.createElement("li");
        const p = f.properties!;
        li.innerHTML = `${p.nama}<br /><span class="j">${p.jenjang} · ${p.n200} minimarket &lt;200 m</span>`;
        li.addEventListener("click", () => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
          map.flyTo({ center: [lon, lat], zoom: 16.2 });
          showRadius(lon, lat);
          popup(lon, lat, p as Record<string, unknown>);
          hasil.innerHTML = "";
          cari.value = "";
        });
        hasil.appendChild(li);
      });
  });

  // パネル開閉
  const panel = document.getElementById("panel")!;
  document.getElementById("toggle")!.addEventListener("click", () =>
    panel.classList.toggle("hidden"),
  );

  document.getElementById("build")!.textContent = __BUILD_TIME__;
  (document.getElementById("repo") as HTMLAnchorElement).href = REPO;
}
