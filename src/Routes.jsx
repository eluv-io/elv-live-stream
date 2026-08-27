import {Navigate} from "react-router-dom";
import AppLayout from "./AppLayout.jsx";
import lazyWithReload from "@/utils/lazyWithReload.js";

const Create = lazyWithReload(() => import("@/pages/create/Create.jsx"), "create");
const Streams = lazyWithReload(() => import("@/pages/streams/Streams.jsx"), "streams");
const Monitor = lazyWithReload(() => import("@/pages/monitor/Monitor.jsx"), "monitor");
const StreamPreview = lazyWithReload(() => import("@/components/stream-preview/StreamPreview.jsx"), "stream-preview");
const StreamDetailsPage = lazyWithReload(() => import("@/pages/streams/details/StreamDetailsPage"), "stream-details");
const Settings = lazyWithReload(() => import("@/pages/settings/Settings.jsx"), "settings");
const Outputs = lazyWithReload(() => import("@/pages/outputs/Outputs.jsx"), "outputs");
const OutputDetails = lazyWithReload(() => import("@/pages/outputs/details/OutputDetails.jsx"), "output-details");
const GroupSummary = lazyWithReload(() => import("@/pages/streams/groups/GroupSummary.jsx"), "group-summary");

const routes = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {index: true, element: <Navigate replace to="/streams" />},
      {path: "monitor", element: <Monitor />},

      {path: "streams/create", element: <Create />},
      {path: "streams/groups/:id", element: <GroupSummary />},
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
