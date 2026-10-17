import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { createMap } from "./basemap";

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
  /** Points that may be displayed. Fewer than the statistical denominator, because
   *  Google Places records cannot be redistributed. */
  minimarket_ditampilkan: number;
  kecamatan: { nama: string; sekolah: number; kena: number; persen: number | null; toko: number }[];
};

// ** Do not use new URL(..., import.meta.url) here. With a template literal Vite cannot
//   analyse it statically, so at runtime it resolves **relative to assets/** and data/
//   404s (this actually happened). BASE_URL is substituted with `base` at build time.
const url = (p: string) => `${import.meta.env.BASE_URL}data/${p}`;
const nf = (n: number) => n.toLocaleString("id-ID");

const { map, wireBasemap } = createMap("Sekolah: OSM/Dukcapil · Minimarket: Overture/OSM");

/** Build the polygon for a selected institution's 200 m / 500 m circles.
 *  Equirectangular approximation at latitude -7; cos(7 deg) ~ 0.9926, so near-isotropic. */
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

  // --- District boundaries (hidden by default) ---
  map.addLayer({
    id: "kec-line", type: "line", source: "kec",
    layout: { visibility: "none" },
    paint: { "line-color": "#8a94a2", "line-width": 1, "line-dasharray": [3, 2] },
  });

  // --- Selected institution radii (fill then outline, kept beneath the outlets) ---
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

  // --- Minimarkets ---
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

  // --- Institutions: red where an outlet is within 200 m, green where none ---
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
  // Layer toggles
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

  // Basemap switching
  wireBasemap((dark) => {
    map.setPaintProperty("sekolah", "circle-stroke-color", dark ? "#0b0d10" : "#fff");
    map.setPaintProperty("toko", "circle-stroke-color", dark ? "#0b0d10" : "#fff");
    map.setPaintProperty("kec-line", "line-color", dark ? "#e8ecf0" : "#8a94a2");
  });

  // Clicking an institution draws its radii and opens a popup
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

  // Search
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

  // Panel open/close
  const panel = document.getElementById("panel")!;
  document.getElementById("toggle")!.addEventListener("click", () =>
    panel.classList.toggle("hidden"),
  );

  document.getElementById("build")!.textContent = __BUILD_TIME__;
  (document.getElementById("repo") as HTMLAnchorElement).href = REPO;
}
