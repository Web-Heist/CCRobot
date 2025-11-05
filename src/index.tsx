
import reportWebVitals from "./reportWebVitals";
import React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { BotProvider } from "./context/BotContext";
import { MqttProvider } from "./context/MqttContext";



const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
<BotProvider>
<MqttProvider>
        <App />
      </MqttProvider>
        </BotProvider>
      </React.StrictMode>
);


// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
