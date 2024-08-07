import SVG from "react-inlinesvg";
import {useState} from "react";

const ImageIcon = ({icon, alternateIcon, label, useLoadingIndicator=false, className, ...props}) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  className = "image-icon " + (className || "");

  const currentIcon = error ? alternateIcon : icon;
  const handleError = error ? undefined : () => setError(true);

  if(!currentIcon) { return null; }

  if(currentIcon.startsWith("<svg")) {
    className = "image-icon--svg " + className;

    return (
      <SVG alt={label} className={className} src={currentIcon} {...props} />
    );
  } else {
    className = "image-icon--image " + className;

    className = loading && useLoadingIndicator ? "image-icon-with-loader " + className : className;

    return (
      <img
        alt={label}
        className={className}
        src={currentIcon}
        onLoad={() => setLoading(false)}
        onError={handleError}
        {...props}
      />
    );
  }
};

export default ImageIcon;
