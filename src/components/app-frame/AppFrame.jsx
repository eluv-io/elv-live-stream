/* AppFrame

This is a sandboxed frame that includes a message passing interface
to allow the contained app to request fabric / blockchain API requests
from the core app, which owns user account information and keys
*/

import URI from "urijs";
import {observer} from "mobx-react-lite";
import React, {useEffect, useRef} from "react";
import {rootStore} from "@/stores/index.js";

// Ensure error objects can be properly serialized in messages
if(!("toJSON" in Error.prototype)) {
  const excludedAttributes = [
    "columnNumber",
    "fileName",
    "lineNumber"
  ];

  Object.defineProperty(Error.prototype, "toJSON", {
    value: function() {
      let object = {};

      Object.getOwnPropertyNames(this).forEach(key => {
        if(!excludedAttributes.includes(key)) {
          object[key] = this[key];
        }
      }, this);

      return object;
    },
    configurable: true,
    writable: true
  });
}

const IsCloneable = (value) => {
  if(Object(value) !== value) {
    // Primitive value
    return true;
  }

  switch({}.toString.call(value).slice(8,-1)) {
    case "Boolean":
    case "Number":
    case "String":
    case "Date":
    case "RegExp":
    case "Blob":
    case "FileList":
    case "ImageData":
    case "ImageBitmap":
    case "ArrayBuffer":
      return true;
    case "Array":
    case "Object":
      return Object.keys(value).every(prop => IsCloneable(value[prop]));
    case "Map":
      return [...value.keys()].every(IsCloneable)
        && [...value.values()].every(IsCloneable);
    case "Set":
      return [...value.keys()].every(IsCloneable);
    default:
      return false;
  }
};

const IFrameBase = ({
  listener,
  appRef,
  appUrl,
  className
}) => {
  useEffect(() => {
    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);
  const SandboxPermissions = () => {
    return [
      "allow-downloads",
      "allow-scripts",
      "allow-forms",
      "allow-modals",
      "allow-pointer-lock",
      "allow-orientation-lock",
      "allow-popups",
      "allow-presentation",
      "allow-same-origin",
    ].join(" ");
  };

  return (
    <iframe
      ref={appRef}
      src={appUrl}
      allow="encrypted-media *"
      allowFullScreen
      sandbox={SandboxPermissions()}
      className={"app-frame " + (className || "")}
    />
  );
};

const IFrame = React.forwardRef(
  ({appUrl, className, listener}, appRef) => (
    <IFrameBase
      appRef={appRef}
      appUrl={appUrl}
      className={className}
      listener={listener}
    />
  )
);

const AppFrame = observer(({
  appUrl,
  className,
  queryParams,
  onComplete,
  onCancel,
  Reload
}) => {
  const appRef = useRef();

  useEffect(() => {
    return () => {
      // App might have set custom node(s), ensure state is reset when unmounting
      rootStore.client.ResetRegion();
    }
  }, []);

  const AppUrl = () => {
    // Inject any query parameters into the given URL
    if(queryParams) {
      const parsedUrl = URI(appUrl);
      Object.keys(queryParams).forEach(key => {
        parsedUrl.addSearch(key, queryParams[key]);
      });
      appUrl = parsedUrl.toString();
    }

    return appUrl;
  };

  const Respond = (requestId, source, responseMessage) => {
    responseMessage = {
      ...responseMessage,
      requestId,
      type: "ElvFrameResponse"
    };

    // If the response is not cloneable, serialize it to remove any non-cloneable parts
    if(!IsCloneable(responseMessage)) {
      responseMessage = JSON.parse(JSON.stringify(responseMessage));
    }

    try {
      // Try sending the response message as-is
      source.postMessage(
        responseMessage,
        "*"
      );
    } catch(error) {
      /* eslint-disable no-console */
      console.error(responseMessage);
      console.error(error);
      /* eslint-enable no-console */
    }
  };

  // Listen for API request messages from frame
  // TODO: Validate origin
  const ApiRequestListener = async(event) => {
    // Ignore unrelated messages
    if(!event || !event.data || event.data.type !== "ElvFrameRequest") { return; }

    if(!event.data.operation) {
      await rootStore.ExecuteFrameRequest({
        request: event.data,
        Respond: (response) => Respond(response.requestId, event.source, response)
      });
    } else {

      switch(event.data.operation) {
        case "Complete":
          if(onComplete) { await onComplete(); }
          break;

        case "Cancel":
          if(onCancel) { await onCancel(); }
          break;

        case "Reload":
          if(Reload) { await Reload(); }
          break;
      }
    }
  };

  return (
    <IFrame
      ref={appRef}
      appUrl={AppUrl()}
      listener={ApiRequestListener}
      className={className}
    />
  );
});

export default AppFrame;
