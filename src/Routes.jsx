import {lazy} from "react";
import {Navigate} from "react-router-dom";
import AppLayout from "./AppLayout.jsx";

const Create = lazy(() => import("@/pages/create/Create.jsx"));
const Streams = lazy(() => import("@/pages/streams/Streams.jsx"));
const Monitor = lazy(() => import("@/pages/monitor/Monitor.jsx"));
const StreamPreview = lazy(() => import("@/components/stream-preview/StreamPreview.jsx"));
const StreamDetailsPage = lazy(() => import("@/pages/streams/details/StreamDetailsPage"));
const Settings = lazy(() => import("@/pages/settings/Settings.jsx"));
const Outputs = lazy(() => import("@/pages/outputs/Outputs.jsx"));
const OutputDetails = lazy(() => import("@/pages/outputs/details/OutputDetails.jsx"));

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