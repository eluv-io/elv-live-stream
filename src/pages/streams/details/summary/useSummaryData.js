import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {streamStore, streamEditStore} from "@/stores/index.ts";

/**
 * Owns all async data loading for SummaryPanel.
 * Returns derived state; SummaryPanel is a pure layout coordinator.
 */
const useSummaryData = ({slug, libraryId}) => {
  const params = useParams();
  const objectId = params.id;

  const [status, setStatus] = useState({state: streamStore.streams?.[slug]?.status});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const [loading, setLoading] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);

  const LoadLiveRecordingCopies = async() => {
    try {
      setLoading(true);
      let copies = await streamEditStore.FetchLiveRecordingCopies({objectId});

      Object.keys(copies || {}).forEach(id => (copies[id]["_id"] = id));
      setLiveRecordingCopies(copies || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const LoadData = async() => {
      await streamStore.LoadSummaryData({objectId, libraryId, slug});
    };

    const LoadStatus = async() => {
      try {
        setLoadingStatus(true);
        const statusResponse = await streamStore.CheckStatus({objectId, slug, update: true});
        setStatus(statusResponse);
      } finally {
        setLoadingStatus(false);
      }
    };

    const LoadEmbedUrl = async() => {
      const url = await streamStore.EmbedUrl({objectId});
      setEmbedUrl(url);
    };

    LoadData();
    LoadLiveRecordingCopies();
    LoadStatus();
    LoadEmbedUrl();
  }, [objectId]);

  return {
    objectId,
    status,
    loadingStatus,
    liveRecordingCopies,
    loading,
    embedUrl,
    LoadLiveRecordingCopies
  };
};

export default useSummaryData;
