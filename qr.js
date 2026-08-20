// Renders a QR code for the given URL into the given container element.
// Load the CDN script before this file:
// <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>

function renderQr(containerEl, url) {
  containerEl.innerHTML = "";
  const canvas = document.createElement("canvas");
  containerEl.appendChild(canvas);
  QRCode.toCanvas(canvas, url, { width: 220 }, (error) => {
    if (error) containerEl.textContent = "Couldn't render QR code.";
  });
}
