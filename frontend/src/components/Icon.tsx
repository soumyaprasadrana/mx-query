/** Font Awesome wrapper so icons stay a single import surface. */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export function Icon({
  icon,
  className,
  title,
}: {
  icon: IconDefinition;
  className?: string;
  title?: string;
}) {
  return <FontAwesomeIcon icon={icon} className={className} title={title} />;
}

export {
  faArrowLeft,
  faArrowRight,
  faArrowRightArrowLeft,
  faArrowsRotate,
  faAsterisk,
  faBars,
  faBook,
  faChartSimple,
  faCheck,
  faChevronDown,
  faChevronRight,
  faClone,
  faCircleNodes,
  faClipboard,
  faCopy,
  faDiagramProject,
  faDownload,
  faEraser,
  faFileImport,
  faFilter,
  faFolder,
  faFolderPlus,
  faFolderTree,
  faFloppyDisk,
  faBookmark,
  faPen,
  faArrowUp,
  faArrowDown,
  faGear,
  faHouse,
  faLayerGroup,
  faLightbulb,
  faListCheck,
  faLock,
  faMagnifyingGlass,
  faPalette,
  faPlay,
  faPlus,
  faRightFromBracket,
  faRobot,
  faSliders,
  faSort,
  faStar,
  faTable,
  faTrashCan,
  faUpload,
  faWandMagicSparkles,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
