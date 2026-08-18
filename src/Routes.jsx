import {Navigate} from "react-router-dom";
import AppLayout from "./AppLayout.jsx";
import lazyWithReload from "@/utils/lazyWithReload.js";

const Create = lazyWithReload(() => import("@/pages/create/Create.jsx"));
const Streams = lazyWithReload(() => import("@/pages/streams/Streams.jsx"));
const Monitor = lazyWithReload(() => import("@/pages/monitor/Monitor.jsx"));
const StreamPreview = lazyWithReload(() => import("@/components/stream-preview/StreamPreview.jsx"));
const StreamDetailsPage = lazyWithReload(() => import("@/pages/streams/details/StreamDetailsPage"));
const Settings = lazyWithReload(() => import("@/pages/settings/Settings.jsx"));
const Outputs = lazyWithReload(() => import("@/pages/outputs/Outputs.jsx"));
const OutputDetails = lazyWithReload(() => import("@/pages/outputs/details/OutputDetails.jsx"));

const routes = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {index: true, element: <Navigate replace to="/streams" />},
      {path: "monitor", element: <Monitor />},

      {path: "streams/create", element: <Create />},
      {path: "streams/:id", element: <StreamDetailsPage />},
      {path: "streams", element: <Streams />},
      {path: "streams/:id/preview", element: <StreamPreview />},

      {path: "outputs", element: <Outputs />},
      {path: "outputs/:id", element: <OutputDetails />},

      {path: "settings", element: <Settings />}
    ]
  }
];

export default routes;