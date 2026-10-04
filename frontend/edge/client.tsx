import { hydrateRoot } from "react-dom/client"
import { App, type RuntimePage } from "./app"

const root = document.getElementById("brawler-runtime")
const input = document.getElementById("brawler-page-data")
if (root && input) {
  const page: RuntimePage = JSON.parse(input.textContent || "null")
  hydrateRoot(root, <App page={page} />)
}
