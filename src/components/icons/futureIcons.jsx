import {
    AlertTriangle as AlertTriangleIcon,
    AudioWaveform as AudioWaveformIcon,
    Box as BoxIcon,
    Calendar as CalendarIcon,
    Check as CheckIcon,
    ChevronDown as ChevronDownIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    Circle as CircleIcon,
    CircleCheck as CircleCheckIcon,
    Clapperboard as ClapperboardIcon,
    Clock as ClockIcon,
    Cpu as CpuIcon,
    CreditCard as CreditCardIcon,
    Crown as CrownIcon,
    DollarSign as DollarSignIcon,
    Download as DownloadIcon,
    ExternalLink as ExternalLinkIcon,
    Eye as EyeIcon,
    Gauge as GaugeIcon,
    HandCoins as HandCoinsIcon,
    Heart as HeartIcon,
    Home as HomeIcon,
    Infinity as InfinityIcon,
    KeyRound as KeyRoundIcon,
    LayoutGrid as LayoutGridIcon,
    Link2 as Link2Icon,
    LoaderCircle as LoaderCircleIcon,
    LogIn as LogInIcon,
    Menu as MenuIcon,
    Monitor as MonitorIcon,
    Music2 as Music2Icon,
    Play as PlayIcon,
    Rocket as RocketIcon,
    RotateCcw as RotateCcwIcon,
    Search as SearchIcon,
    Shield as ShieldIcon,
    ShieldCheck as ShieldCheckIcon,
    ShoppingCart as ShoppingCartIcon,
    Sparkles as SparklesIcon,
    Square as SquareIcon,
    Star as StarIcon,
    Store as StoreIcon,
    TrendingUp as TrendingUpIcon,
    Upload as UploadIcon,
    User as UserIcon,
    Video as VideoIcon,
    WandSparkles as WandSparklesIcon,
    Waves as WavesIcon,
    X as XIcon,
    Zap as ZapIcon,
    Users as UsersIcon,
} from 'lucide-react'

function withCompat(Icon) {
    const CompatIcon = ({ weight: _weight, ...props }) => <Icon {...props} />
    CompatIcon.displayName = `Future${Icon.displayName || 'Icon'}`
    return CompatIcon
}

export const House = withCompat(HomeIcon)
export const Gauge = withCompat(GaugeIcon)
export const MagicWand = withCompat(WandSparklesIcon)
export const MusicNotes = withCompat(Music2Icon)
export const Storefront = withCompat(StoreIcon)
export const Cpu = withCompat(CpuIcon)
export const LinkSimple = withCompat(Link2Icon)
export const CurrencyDollar = withCompat(DollarSignIcon)
export const Sparkle = withCompat(SparklesIcon)
export const List = withCompat(MenuIcon)
export const X = withCompat(XIcon)
export const CaretDown = withCompat(ChevronDownIcon)
export const CaretLeft = withCompat(ChevronLeftIcon)
export const CaretRight = withCompat(ChevronRightIcon)
export const SignIn = withCompat(LogInIcon)
export const Lightning = withCompat(ZapIcon)
export const ShieldStar = withCompat(ShieldIcon)
export const ArrowSquareOut = withCompat(ExternalLinkIcon)
export const Check = withCompat(CheckIcon)
export const WarningCircle = withCompat(AlertTriangleIcon)
export const User = withCompat(UserIcon)
export const Key = withCompat(KeyRoundIcon)
export const ShieldCheck = withCompat(ShieldCheckIcon)
export const SpinnerGap = withCompat(LoaderCircleIcon)
export const VideoCamera = withCompat(VideoIcon)
export const Cube = withCompat(BoxIcon)
export const Waves = withCompat(WavesIcon)
export const ClockCounterClockwise = withCompat(RotateCcwIcon)
export const CreditCard = withCompat(CreditCardIcon)
export const DownloadSimple = withCompat(DownloadIcon)
export const TrendUp = withCompat(TrendingUpIcon)
export const Clock = withCompat(ClockIcon)
export const FilmSlate = withCompat(ClapperboardIcon)
export const HandCoins = withCompat(HandCoinsIcon)
export const Rows = withCompat(LayoutGridIcon)
export const Waveform = withCompat(AudioWaveformIcon)
export const RocketLaunch = withCompat(RocketIcon)
export const Users = withCompat(UsersIcon)
export const MagnifyingGlass = withCompat(SearchIcon)
export const Star = withCompat(StarIcon)
export const ShoppingCart = withCompat(ShoppingCartIcon)
export const UploadSimple = withCompat(UploadIcon)
export const Eye = withCompat(EyeIcon)
export const Heart = withCompat(HeartIcon)
export const Crown = withCompat(CrownIcon)
export const InfinitySymbol = withCompat(InfinityIcon)
export const CalendarBlank = withCompat(CalendarIcon)
export const CheckCircle = withCompat(CircleCheckIcon)
export const Record = withCompat(CircleIcon)
export const Stop = withCompat(SquareIcon)
export const Play = withCompat(PlayIcon)
export const DesktopTower = withCompat(MonitorIcon)
