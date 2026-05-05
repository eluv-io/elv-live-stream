import {useEffect} from "react";
import {streamStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";

const DataWrapper = observer(({children}) => {
  useEffect(() => {

    const GetStatus = async () => {
      try {
        await streamStore.AllStreamsStatus();
      } catch(error) {
        // eslint-disable-next-line no-console
        console.error("Unable to get stream status.", error);
      }
    };

    GetStatus();

    let intervalId = setInterval(async () => {
      await GetStatus();
    }, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return children;
});

export default DataWrapper;
