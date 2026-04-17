import {StreamIcon} from "@/assets/icons/index.js";
import {AppShell, NavLink} from "@mantine/core";
import {useLocation, useNavigate} from "react-router-dom";
import styles from "@/components/left-navigation/LeftNavigation.module.css";
import {IconDeviceTv, IconRoute, IconSettings} from "@tabler/icons-react";

const iconDimensions = {
  width: 22,
  height: 20
};

const NAV_LINKS = [
  {path: "/streams", label: "Streams", icon: <StreamIcon width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/outputs", label: "Outputs", icon: <IconRoute width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/monitor", label: "Monitor", icon: <IconDeviceTv width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/settings", label: "Settings", icon: <IconSettings width={iconDimensions.width} height={iconDimensions.height} />}
];

const LeftNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppShell.Navbar p="24 14">
      {
        NAV_LINKS.map(({path, label, icon}) => (
          <NavLink
            key={`navigation-link-${path}`}
            classNames={{
              root: styles.root,
              label: styles.label,
              section: styles.section
          }}
            href="#"
            label={label}
            leftSection={icon}
            onClick={() => navigate(path)}
            title={label}
            active={location.pathname.includes(path)}
          />
        ))
      }
    </AppShell.Navbar>
  );
};

export default LeftNavigation;
