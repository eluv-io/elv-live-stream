import {Navigate, Route, Routes} from "react-router-dom";
import {observer} from "mobx-react-lite";
import Create from "@/pages/create/Create.jsx";
import Streams from "@/pages/streams/Streams.jsx";
import Monitor from "@/pages/monitor/Monitor.jsx";
import StreamPreview from "@/components/stream-preview/StreamPreview.jsx";
import StreamDetailsPage from "@/pages/stream-details/StreamDetailsPage";
import Settings from "@/pages/settings/Settings.jsx";
import Outputs from "@/pages/outputs/Outputs.jsx";

const AppRoutes = observer(() => {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/streams" />} />
      <Route path="/create" element={<Create />} />
      <Route path="/monitor" element={<Monitor />} />

      <Route path="/streams/:id" element={<StreamDetailsPage />} />
      <Route path="/streams" element={<Streams />} />
      <Route path="/streams/:id/preview" element={<StreamPreview />} />

      <Route path="/outputs" element={<Outputs />} />

      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
});

export default AppRoutes;
