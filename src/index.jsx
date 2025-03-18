import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import {StrictMode} from "react";

const rootElement = ReactDOM.createRoot(document.getElementById("root"));

rootElement.render(
  <StrictMode>
    <App />
  </StrictMode>
);
