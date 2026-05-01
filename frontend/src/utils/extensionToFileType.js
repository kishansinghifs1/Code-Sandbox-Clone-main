const extensionToTypeMap = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  ico: "image",
  txt: "text",
  env: "env",
  lock: "lock",
  xml: "xml",
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  php: "php",
  sh: "shell",
  bash: "shell",
  sql: "database",
  dockerfile: "docker",
};


export const extensionToFileType = (extension) => {
    if(!extension) return undefined;
    console.log(extensionToTypeMap[extension]);
    return extensionToTypeMap[extension];
}