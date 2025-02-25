import {VideoPlusIcon, StreamIcon, MediaIcon, SettingsIcon} from "@/assets/icons/index.js";
import {AppShell, NavLink} from "@mantine/core";
import {useLocation, useNavigate} from "react-router-dom";
import styles from "@/components/left-navigation/LeftNavigation.module.css";

const iconDimensions = {
  width: 22,
  height: 20
};

const NAV_LINKS = [
  {path: "/create", label: "Create", icon: <VideoPlusIcon width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/streams", label: "Streams", icon: <StreamIcon width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/monitor", label: "Monitor", icon: <MediaIcon width={iconDimensions.width} height={iconDimensions.height} />},
  {path: "/settings", label: "Settings", icon: <SettingsIcon width={iconDimensions.width} height={iconDimensions.height} />}
];

const LeftNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppShell.Navbar p="24 14" bg="linear-gradient(90deg, var(--mantine-color-elv-gray-1) 0%, var(--mantine-color-elv-gray-0) 100%)">
      {
        NAV_LINKS.map(({path, label, icon}) => (
          <NavLink
            key={`navigation-link-${path}`}
            classNames={{root: styles.root}}
            href="#"
            label={label}
            leftSection={icon}
            onClick={() => navigate(path)}
            title={label}
            active={path === location.pathname}
            p="8px 8px"
          />
        ))
      }
    </AppShell.Navbar>
  );
};

export default LeftNavigation;
