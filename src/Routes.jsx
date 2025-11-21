import {Navigate, Route, Routes} from "react-router-dom";
import {observer} from "mobx-react-lite";
import {lazy, Suspense} from "react";
import {Loader, Center} from "@mantine/core";

// Lazy load routes to reduce initial bundle size
const Create = lazy(() => import("@/pages/create/Create.jsx"));
const Streams = lazy(() => import("@/pages/streams/Streams.jsx"));
const Monitor = lazy(() => import("@/pages/monitor/Monitor.jsx"));
const StreamPreview = lazy(() => import("@/components/stream-preview/StreamPreview.jsx"));
const StreamDetailsPage = lazy(() => import("@/pages/stream-details/StreamDetailsPage"));
const Settings = lazy(() => import("@/pages/settings/Settings.jsx"));

const AppRoutes = observer(() => {
  return (
    <Suspense fallback={<Center h="100vh"><Loader /></Center>}>
      <Routes>
        <Route path="/" element={<Navigate replace to="/streams" />} />
        <Route path="/create" element={<Create />} />
        <Route path="/monitor" element={<Monitor />} />

        <Route path="/streams/:id" element={<StreamDetailsPage />} />
        <Route path="/streams" element={<Streams />} />
        <Route path="/streams/:id/preview" element={<StreamPreview />} />

        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
});

export default AppRoutes;
