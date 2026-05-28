import {lazy, Suspense} from "react";
import {Navigate, Route, Routes} from "react-router-dom";
import {observer} from "mobx-react-lite";
import {Flex, Loader} from "@mantine/core";

const Create = lazy(() => import("@/pages/create/Create.jsx"));
const Streams = lazy(() => import("@/pages/streams/Streams.jsx"));
const Monitor = lazy(() => import("@/pages/monitor/Monitor.jsx"));
const StreamPreview = lazy(() => import("@/components/stream-preview/StreamPreview.jsx"));
const StreamDetailsPage = lazy(() => import("@/pages/streams/details/StreamDetailsPage"));
const Settings = lazy(() => import("@/pages/settings/Settings.jsx"));
const Outputs = lazy(() => import("@/pages/outputs/Outputs.jsx"));
const OutputDetails = lazy(() => import("@/pages/outputs/details/OutputDetails.jsx"));

const AppRoutes = observer(() => {
  return (
    <Suspense fallback={<Flex justify="center" align="center" h="100%"><Loader /></Flex>}>
    <Routes>
      <Route path="/" element={<Navigate replace to="/streams" />} />
      <Route path="/monitor" element={<Monitor />} />

      <Route path="/streams/create" element={<Create />} />
      <Route path="/streams/:id" element={<StreamDetailsPage />} />
      <Route path="/streams" element={<Streams />} />
      <Route path="/streams/:id/preview" element={<StreamPreview />} />

      <Route path="/outputs" element={<Outputs />} />
      <Route path="/outputs/:id" element={<OutputDetails />} />

      <Route path="/settings" element={<Settings />} />
    </Routes>
    </Suspense>
  );
});

export default AppRoutes;
