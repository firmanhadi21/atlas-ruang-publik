import maplibregl from "maplibre-gl";

/* ---- Basemaps, shared by every study page ----
   The Japan viewer uses GSI tiles, which do not cover Indonesia. These three are free
   and require attribution.

   ** CARTO tiles need an API key (?key=) or they come back watermarked "API key
      required". It is read from CARTO_API_KEY in .env (exposed via envPrefix in
      vite.config.ts) and ends up in the public bundle, as any client-side tile key
      does, so restrict it to this site's referrer in the CARTO dashboard.

   ** Google Maps cannot be one of them. The Google Maps Platform terms prohibit displaying
      Google content **on a non-Google map**, so pointing MapLibre at Google tile URLs
      breaches them. Doing it legitimately means moving to the Maps JavaScript API, which
      costs three things: (1) an API key exposed client-side, (2) billing per map load, so
      the bill grows precisely as the map gets shared, and (3) data that cannot be
      republished, leaving the work unverifiable by third parties. For material aimed at
      government those are bad trades, so it is not used. Esri World Imagery covers the
      satellite case instead. */
type Basemap = { tiles: string[]; attr: string; note: string; maxzoom?: number };
const CARTO_KEY: string = import.meta.env.CARTO_API_KEY ?? "";
if (!CARTO_KEY) console.warn("CARTO_API_KEY is not set; CARTO basemaps will be watermarked.");
const cartoTiles = (style: string) =>
  ["a", "b", "c"].map(
    (s) =>
      `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(CARTO_KEY)}`,
  );
const BASEMAPS: Record<string, Basemap> = {
  terang: {
    tiles: cartoTiles("light_all"),
    attr: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    note: "Peta polos — paling mudah membaca titik dan radius.",
  },
  detail: {
    tiles: cartoTiles("rastertiles/voyager"),
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

/** Map with all basemaps loaded, navigation and scale controls, and attribution that
 *  follows the active basemap. `dataAttr` credits the page's own layers. */
export function createMap(dataAttr: string) {
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
      // ** All three rasters are loaded and toggled by visibility rather than swapped with
      //   setStyle. setStyle forces every overlay to be re-added each time (a Japan-side
      //   pitfall); for raster-to-raster, toggling visibility is more reliable and faster.
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

  // Attribution differs per basemap, so it is replaced on each switch. Letting MapLibre
  // aggregate attribution from every source in the style would credit hidden basemaps too.
  let attribCtl: maplibregl.AttributionControl | null = null;
  const setAttribution = (bm: string) => {
    if (attribCtl) map.removeControl(attribCtl);
    attribCtl = new maplibregl.AttributionControl({
      compact: true,
      customAttribution: `${BASEMAPS[bm].attr} · ${dataAttr}`,
    });
    map.addControl(attribCtl, "bottom-right");
  };
  setAttribution(activeBm);
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

  /** Wire the #basemap segmented control and #bm-note. `onChange(dark)` lets the page
   *  restyle its overlays: white outlines vanish over satellite imagery. */
  const wireBasemap = (onChange: (dark: boolean) => void) => {
    const note = document.getElementById("bm-note")!;
    const seg = document.getElementById("basemap")!;
    const applyBm = (k: string) => {
      for (const key of Object.keys(BASEMAPS)) {
        map.setLayoutProperty(`bm-${key}`, "visibility", key === k ? "visible" : "none");
      }
      onChange(k === "satelit");
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
  };

  return { map, wireBasemap };
}
