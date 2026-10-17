import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import "./smk.css";
import { createMap } from "./basemap";

declare const __BUILD_TIME__: string;

const REPO = "https://github.com/firmanhadi21/atlas-ruang-publik";

/** The five factors, each already scaled 0–100 by the build step (s_<key>). */
const FACTORS = ["jangkauan", "arteri", "depan", "keramaian", "transit"] as const;
type Factor = (typeof FACTORS)[number];
type Weights = Record<Factor, number>;

const LABEL: Record<Factor, { name: string; desc: string }> = {
  jangkauan: { name: "Jangkauan pelanggan", desc: "warga yang dapat mencapai SMK dalam 10 menit" },
  arteri: { name: "Akses jalan utama", desc: "jarak ke jalan arteri/kolektor" },
  depan: { name: "Jalan depan gerbang", desc: "kelas jalan terdekat" },
  keramaian: { name: "Keramaian komersial", desc: "tempat usaha dalam 500 m" },
  transit: { name: "Angkutan umum", desc: "jarak ke halte terdekat" },
};

const PRESETS: Record<string, Weights> = {
  seimbang: { jangkauan: 35, arteri: 25, depan: 15, keramaian: 15, transit: 10 },
  // Vehicle servicing: customers ride in, so frontage on a through road matters most
  kendaraan: { jangkauan: 30, arteri: 35, depan: 20, keramaian: 5, transit: 10 },
  // Food and retail: walk-in trade, so passers-by and public transport weigh more
  kuliner: { jangkauan: 30, arteri: 10, depan: 15, keramaian: 30, transit: 15 },
};

// OSM highway class -> how it reads on an Indonesian street
const KELAS: Record<string, string> = {
  trunk: "Arteri (jalan nasional)",
  primary: "Arteri",
  secondary: "Kolektor",
  tertiary: "Jalan lokal",
  unclassified: "Jalan lokal kecil",
  residential: "Jalan lingkungan",
  road: "Jalan lingkungan",
  living_street: "Gang",
  service: "Jalan akses",
};

type Ringkasan = {
  total_smk: number;
  /** Where each coordinate came from: osm / overture / perkiraan (Dukcapil geocode) */
  sumber: { osm: number; overture: number; perkiraan: number };
  negeri: number;
  median_d_arteri: number;
  persen_arteri_300: number;
  smk_jalan_lingkungan: number;
  smk_nyelempit: number;
  persen_nyelempit: number;
  median_pop10: number;
  bobot: Weights;
};

type Props = Record<string, unknown> & { id: number; nama: string; skor: number };

const url = (p: string) => `${import.meta.env.BASE_URL}data/smk-visibility/${p}`;
const kecUrl = `${import.meta.env.BASE_URL}data/kecamatan.geojson`;
const nf = (n: number) => Math.round(n).toLocaleString("id-ID");
const pct = (n: number) => String(n).replace(".", ",");

// Diverging ramp: low score (tucked away) warm, high score (well placed) teal.
// Kept in sync with .ramp in smk.css.
const RAMP: [number, string][] = [[0, "#c2412d"], [35, "#e79a3c"], [55, "#e9cf6a"], [75, "#5fa89a"], [100, "#1f6f78"]];
const rampColor = (v: number) => {
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) return RAMP[i - 1][1];
  }
  return RAMP[RAMP.length - 1][1];
};

const { map, wireBasemap } = createMap(
  "SMK: OSM/Dukcapil · Penduduk: WorldPop · Tempat usaha: Overture",
);

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
let smk: GeoJSON.FeatureCollection<GeoJSON.Point, Props>;
let reach = new Map<number, GeoJSON.Feature>();
let weights: Weights = { ...PRESETS.seimbang };
let selected: number | null = null;

map.on("load", async () => {
  const [pts, jangkau, kec, ring] = await Promise.all([
    fetch(url("smk.geojson")).then((r) => r.json()),
    fetch(url("jangkauan.geojson")).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>),
    fetch(kecUrl).then((r) => r.json()),
    fetch(url("ringkasan.json")).then((r) => r.json() as Promise<Ringkasan>),
  ]);
  smk = pts;
  reach = new Map(jangkau.features.map((f) => [Number(f.properties?.id), f]));
  weights = { ...ring.bobot };

  map.addSource("kec", { type: "geojson", data: kec });
  map.addSource("jangkau", { type: "geojson", data: empty });
  map.addSource("smk", { type: "geojson", data: smk, promoteId: "id" });

  map.addLayer({
    id: "kec-line", type: "line", source: "kec",
    layout: { visibility: "none" },
    paint: { "line-color": "#8a94a2", "line-width": 1, "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "jangkau-fill", type: "fill", source: "jangkau",
    paint: { "fill-color": "#1f6f78", "fill-opacity": 0.14 },
  });
  map.addLayer({
    id: "jangkau-line", type: "line", source: "jangkau",
    paint: { "line-color": "#1f6f78", "line-width": 1.4 },
  });
  map.addLayer({
    id: "smk", type: "circle", source: "smk",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        10, ["case", ["boolean", ["feature-state", "sel"], false], 7, 4.5],
        14, ["case", ["boolean", ["feature-state", "sel"], false], 11, 7.5],
        17, 12,
      ],
      "circle-color": [
        "interpolate", ["linear"], ["get", "skor"],
        ...RAMP.flatMap(([v, c]) => [v, c]),
      ] as unknown as maplibregl.ExpressionSpecification,
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.6, 1.4],
      "circle-stroke-color": "#fff",
    },
  });
  // Schools whose only coordinate is Dukcapil's geocode (can be ~1–3 km off) are drawn
  // as hollow rings, so a reader does not mistake the measured frontage for fact.
  map.setPaintProperty("smk", "circle-color", [
    "case", ["==", ["get", "lokasi"], "perkiraan"], "#ffffff",
    map.getPaintProperty("smk", "circle-color"),
  ] as maplibregl.ExpressionSpecification);
  setStroke(false);

  renderRingkasan(ring);
  document.getElementById("perkiraan-n")!.textContent = `(${ring.sumber.perkiraan} SMK)`;
  renderSliders();
  rescore();
  wireUI();
});

/** Outline: white (dark over satellite), except approximate locations, which take the
 *  score colour as a thick ring around a white centre. */
function setStroke(dark: boolean) {
  const ramp = ["interpolate", ["linear"], ["get", "skor"], ...RAMP.flatMap(([v, c]) => [v, c])];
  map.setPaintProperty("smk", "circle-stroke-color", [
    "case", ["==", ["get", "lokasi"], "perkiraan"], ramp, dark ? "#0b0d10" : "#fff",
  ] as unknown as maplibregl.ExpressionSpecification);
  map.setPaintProperty("smk", "circle-stroke-width", [
    "case",
    ["==", ["get", "lokasi"], "perkiraan"], 3,
    ["boolean", ["feature-state", "sel"], false], 2.6,
    1.4,
  ]);
}

/* ---- Scoring: recomputed in the browser so the weights stay the reader's choice ---- */
function rescore() {
  const total = FACTORS.reduce((a, k) => a + weights[k], 0) || 1;
  for (const f of smk.features) {
    const p = f.properties;
    p.skor = Math.round(FACTORS.reduce((a, k) => a + weights[k] * Number(p[`s_${k}`]), 0) / total);
  }
  (map.getSource("smk") as maplibregl.GeoJSONSource).setData(smk);
  renderPeringkat();
  renderKecamatan();
}

function renderRingkasan(r: Ringkasan) {
  document.getElementById("ringkasan")!.innerHTML = `
    <div class="stat-big">${pct(r.persen_nyelempit)}<small>%</small></div>
    <p class="stat-cap"><b>${r.smk_nyelempit} dari ${r.total_smk} SMK</b> di Kota Semarang
      berada di <b>jalan lingkungan</b> dan lebih dari <b>300 m</b> dari jalan arteri atau
      kolektor — “nyelempit” dalam arti yang paling harfiah.</p>
    <p class="stat-sub">Median jarak SMK ke jalan arteri/kolektor:
      <b>${nf(r.median_d_arteri)} m</b>; ${pct(r.persen_arteri_300)}% berjarak lebih dari
      300 m.<br />
      Median warga yang dapat mencapai SMK dalam 10 menit: <b>${nf(r.median_pop10)}</b>.</p>`;
}

function renderSliders() {
  const box = document.getElementById("bobot")!;
  box.innerHTML = FACTORS.map(
    (k) => `<label class="slider">
      <span class="sl-head"><b>${LABEL[k].name}</b><output id="o-${k}"></output></span>
      <input type="range" id="w-${k}" min="0" max="50" step="5" value="${weights[k]}"
        aria-describedby="d-${k}" />
      <span class="sl-desc" id="d-${k}">${LABEL[k].desc}</span>
    </label>`,
  ).join("");
  const showOut = () => {
    const total = FACTORS.reduce((a, k) => a + weights[k], 0) || 1;
    for (const k of FACTORS) {
      document.getElementById(`o-${k}`)!.textContent = `${Math.round((weights[k] / total) * 100)}%`;
    }
  };
  showOut();
  for (const k of FACTORS) {
    const el = document.getElementById(`w-${k}`) as HTMLInputElement;
    el.addEventListener("input", () => {
      weights[k] = Number(el.value);
      setPresetButtons(null);
      showOut();
      rescore();
    });
  }

  const seg = document.getElementById("preset")!;
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    const p = b?.dataset.p;
    if (!p) return;
    weights = { ...PRESETS[p] };
    for (const k of FACTORS) (document.getElementById(`w-${k}`) as HTMLInputElement).value = String(weights[k]);
    setPresetButtons(p);
    showOut();
    rescore();
  });
}

function setPresetButtons(p: string | null) {
  document.querySelectorAll<HTMLButtonElement>("#preset button").forEach((b) => {
    const on = b.dataset.p === p;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
}

function renderPeringkat() {
  const rows = [...smk.features].sort((a, b) => b.properties.skor - a.properties.skor);
  document.getElementById("rank-n")!.textContent = `— ${rows.length} SMK`;
  const ol = document.getElementById("peringkat")!;
  ol.innerHTML = rows
    .map(
      (f) => `<li data-id="${f.properties.id}">
        <span class="rk-nama">${f.properties.nama}<span class="j">${f.properties.kec ?? ""}</span></span>
        <span class="rk-skor" style="background:${rampColor(f.properties.skor)}">${f.properties.skor}</span>
      </li>`,
    )
    .join("");
}

function renderKecamatan() {
  const by = new Map<string, number[]>();
  for (const f of smk.features) {
    const k = String(f.properties.kec ?? "—");
    by.set(k, [...(by.get(k) ?? []), f.properties.skor]);
  }
  const rows = [...by.entries()]
    .map(([nama, v]) => ({ nama, n: v.length, skor: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }))
    .sort((a, b) => b.skor - a.skor);
  document.getElementById("tabel-kec")!.innerHTML =
    `<thead><tr><th>Kecamatan</th><th>SMK</th><th>Rerata skor</th><th></th></tr></thead><tbody>` +
    rows
      .map(
        (k) => `<tr><td>${k.nama}</td><td>${k.n}</td><td><b>${k.skor}</b></td>
        <td style="width:56px"><span class="bar" style="width:${(k.skor / 100) * 50}px"></span></td></tr>`,
      )
      .join("") +
    `</tbody>`;
}

/* ---- Selection: reach polygon, highlight, popup ---- */
function select(f: GeoJSON.Feature<GeoJSON.Point, Props>, fly = false) {
  const p = f.properties;
  if (selected !== null) map.setFeatureState({ source: "smk", id: selected }, { sel: false });
  selected = p.id;
  map.setFeatureState({ source: "smk", id: p.id }, { sel: true });
  const r = reach.get(p.id);
  (map.getSource("jangkau") as maplibregl.GeoJSONSource).setData(
    r ? { type: "FeatureCollection", features: [r] } : empty,
  );
  const [lon, lat] = f.geometry.coordinates as [number, number];
  // Zoom 13 keeps the 10-minute reach in view; closer in, it fills the screen
  if (fly) map.flyTo({ center: [lon, lat], zoom: 13 });
  popup(lon, lat, p);
}

function popup(lon: number, lat: number, p: Props) {
  const raw: Record<Factor, string> = {
    jangkauan: `${nf(Number(p.pop10))} warga ≤ 10 menit`,
    arteri: `${nf(Number(p.d_arteri))} m${p.arteri ? ` ke ${p.arteri}` : ""}`,
    depan: KELAS[String(p.kelas_depan)] ?? String(p.kelas_depan),
    keramaian: `${nf(Number(p.n500))} tempat usaha ≤ 500 m`,
    transit: `halte ${nf(Number(p.d_halte))} m`,
  };
  const bars = FACTORS.map((k) => {
    const s = Number(p[`s_${k}`]);
    return `<div class="pf">
      <div class="pf-head"><span>${LABEL[k].name}</span><b>${s}</b></div>
      <div class="pf-track"><span style="width:${s}%;background:${rampColor(s)}"></span></div>
      <div class="pf-raw">${raw[k]}</div>
    </div>`;
  }).join("");
  new maplibregl.Popup({ offset: 12, maxWidth: "290px" })
    .setLngLat([lon, lat])
    .setHTML(
      `<div class="pop-nama">${p.nama}</div>
       <div class="pop-j">SMK ${p.status} · ${p.kec ?? "—"}</div>
       <div class="pop-skor"><span style="background:${rampColor(p.skor)}">${p.skor}</span>
         skor lokasi dengan bobot saat ini</div>
       ${p.lokasi === "perkiraan"
         ? `<div class="pop-warn">Lokasi perkiraan (geokode Dukcapil, dapat meleset
            1–3 km) — faktor jalan dan halte belum dapat dipercaya.</div>`
         : ""}
       ${bars}`,
    )
    .addTo(map);
}

function wireUI() {
  const bind = (id: string, layers: string[]) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.addEventListener("change", () =>
      layers.forEach((l) =>
        map.setLayoutProperty(l, "visibility", el.checked ? "visible" : "none"),
      ),
    );
  };
  bind("l-smk", ["smk"]);
  bind("l-jangkau", ["jangkau-fill", "jangkau-line"]);
  bind("l-kec", ["kec-line"]);

  wireBasemap((dark) => {
    setStroke(dark);
    map.setPaintProperty("kec-line", "line-color", dark ? "#e8ecf0" : "#8a94a2");
    map.setPaintProperty("jangkau-line", "line-color", dark ? "#9fe3df" : "#1f6f78");
  });

  const byId = (id: number) => smk.features.find((f) => f.properties.id === id)!;
  map.on("click", "smk", (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id !== undefined) select(byId(Number(id)));
  });
  map.on("mouseenter", "smk", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "smk", () => (map.getCanvas().style.cursor = ""));

  document.getElementById("peringkat")!.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest("li");
    if (li?.dataset.id) select(byId(Number(li.dataset.id)), true);
  });

  // Search
  const cari = document.getElementById("cari") as HTMLInputElement;
  const hasil = document.getElementById("hasil")!;
  cari.addEventListener("input", () => {
    const q = cari.value.trim().toLowerCase();
    hasil.innerHTML = "";
    if (q.length < 2) return;
    smk.features
      .filter((f) => f.properties.nama.toLowerCase().includes(q))
      .slice(0, 30)
      .forEach((f) => {
        const li = document.createElement("li");
        li.innerHTML = `${f.properties.nama}<br /><span class="j">${f.properties.kec ?? ""} · skor ${f.properties.skor}</span>`;
        li.addEventListener("click", () => {
          select(f, true);
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
