import {useRef, useEffect} from "react";
import {Alert, Box} from "@mantine/core";

const AlertMessage = ({error, onClose, ...props}) => {
  const errorRef = useRef(null);

  useEffect(() => {
    if(errorRef && errorRef.current) {
      errorRef.current.scrollIntoView();
    }
  }, [error]);

  if(!error) { return null; }

  const {title, message} = error;

  return (
    <Box ref={errorRef} mb={16} {...props}>
      <Alert
        variant="light"
        color="elv-red.4"
        title={title}
        withCloseButton
        onClose={onClose}
      >
        { message }
      </Alert>
    </Box>
  );
};

export default AlertMessage;
