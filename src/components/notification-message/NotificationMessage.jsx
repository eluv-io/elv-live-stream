import {Text} from "@mantine/core";

const NotificationMessage = ({children, ...rest}) => {
  return (
    <Text lineClamp={2} fz={14} {...rest}>{ children }</Text>
  );
};

export default NotificationMessage;
