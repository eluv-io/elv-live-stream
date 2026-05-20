export const SortTable = ({sortStatus, AdditionalCondition}) => {
  return (a, b) => {
    if(AdditionalCondition && typeof AdditionalCondition(a, b) !== "undefined") {
      return AdditionalCondition(a, b);
    }

    a = a[sortStatus.columnAccessor];
    b = b[sortStatus.columnAccessor];

    if(typeof a === "number" && typeof b === "number") {
      a = isNaN(a) ? 0 : a;
      b = isNaN(b) ? 0 : b;
    } else {
      a = typeof a === "string" ? a.trim().toLowerCase() : a ?? "";
      b = typeof b === "string" ? b.trim().toLowerCase() : b ?? "";
    }

    if(a === b) { return 0; }

    return (a < b ? -1 : 1) * (sortStatus.direction === "asc" ? 1 : -1);
  };
};

export const SanitizeUrl = ({url, removeQueryParams=[]}) => {
  if(!url) {
    return "";
  }

  try {
    const urlObject = new URL(url);
    urlObject.searchParams.delete("passphrase");
    removeQueryParams.forEach(param => {
      urlObject.searchParams.delete(param);
    });

    return urlObject.toString();
  } catch(_e) {
    // Only apply the regex fallback for strings that look like a URL (have a scheme).
    // Plain invalid strings (e.g. "not a valid url") should return false.
    if(!url.includes("://")) { return false; }
    // Fallback for URLs with out-of-range ports (e.g. rtp://) that new URL() rejects
    const paramsToRemove = ["passphrase", ...removeQueryParams];
    return paramsToRemove.reduce((acc, param) => {
      return acc.replace(new RegExp(`([?&])${param}=[^&]*(&?)`, "g"), (_, prefix, suffix) => {
        return suffix ? prefix : "";
      });
    }, url);
  }
};

const FallbackCopyToClipboard = ({text}) => {
  const element = document.createElement("textarea");
  element.value = text;
  element.style.all = "unset";
  // Avoid screen readers from reading text out loud
  element.ariaHidden = "true";
  // used to preserve spaces and line breaks
  element.style.whiteSpace = "pre";
  // do not inherit user-select (it may be `none`)
  element.style.webkitUserSelect = "text";
  element.style.MozUserSelect = "text";
  element.style.msUserSelect = "text";
  element.style.userSelect = "text";

  document.body.appendChild(element);
  element.focus();
  element.select();

  try {
    document.execCommand("copy");
    document.body.removeChild(element);
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error("Unable to copy to clipboard", error);
  }
};

export const CopyToClipboard = ({text}) => {
  if(!navigator.clipboard) {
    FallbackCopyToClipboard({text});
    return;
  }

  navigator.clipboard.writeText(text)
    .catch(error => {
      if(error instanceof DOMException && error.name === "NotAllowedError") {
        FallbackCopyToClipboard({text});
      } else {
        // eslint-disable-next-line no-console
        console.error("Unable to copy to clipboard", error);
      }
    });
};

export const CheckExpiration = (date) => {
  if(typeof date !== "number") { return false; }

  const today = new Date();
  const inputDate = new Date(date);

  inputDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return inputDate < today;
};

// Convert a FileList to file info
export const FileInfo = async ({path, fileList}) => {
  return Promise.all(
    Array.from(fileList).map(async file => {
      const data = file;
      const filePath = file.webkitRelativePath || file.name;
      return {
        path: `${path}${filePath}`.replace(/^\/+/g, ""),
        type: "file",
        size: file.size,
        mime_type: file.type,
        data
      };
    })
  );
};