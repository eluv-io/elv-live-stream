import {VideoPlusIcon, StreamIcon, MediaIcon, SettingsIcon} from "@/assets/icons/index.js";
import {AppShell, NavLink, Tooltip} from "@mantine/core";
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
    <AppShell.Navbar p="24 14">
      {
        NAV_LINKS.map(({path, label, icon}) => (
          <Tooltip
            key={`navigation-link-${path}`}
            label={label}
            position="right"
            withArrow
          >
            <NavLink
              classNames={{section: styles.section, body: styles.body, root: styles.root}}
              href="#"
              onClick={() => navigate(path)}
              leftSection={icon}
              title={label}
              active={path === location.pathname}
            />
          </Tooltip>
        ))
      }
    </AppShell.Navbar>
  );
};

export default LeftNavigation;
