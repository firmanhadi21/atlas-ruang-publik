declare const __BUILD_TIME__: string;

document.getElementById("build")!.textContent = __BUILD_TIME__;
(document.getElementById("repo") as HTMLAnchorElement).href =
  "https://github.com/firmanhadi21/atlas-ruang-publik";
