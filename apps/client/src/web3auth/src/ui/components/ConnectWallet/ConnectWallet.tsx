import { ANALYTICS_EVENTS, type ChainNamespaceType, type WALLET_CONNECTOR_TYPE, WALLET_CONNECTORS } from "@web3auth/no-modal";
import { FormEvent, useContext, useMemo, useState } from "react";

import { CONNECT_WALLET_PAGES } from "../../constants";
import { AnalyticsContext } from "../../context/AnalyticsContext";
import { RootContext } from "../../context/RootContext";
import { ExternalButton } from "../../interfaces";
import { ConnectWalletProps } from "./ConnectWallet.type";
import ConnectWalletChainFilter from "./ConnectWalletChainFilter";
import ConnectWalletHeader from "./ConnectWalletHeader";
import ConnectWalletList from "./ConnectWalletList";
import ConnectWalletQrCode from "./ConnectWalletQrCode";
import ConnectWalletSearch from "./ConnectWalletSearch";

function ConnectWallet(props: ConnectWalletProps) {
  const {
    isDark,
    config,
    walletConnectUri,
    metamaskConnectUri,
    walletRegistry,
    allExternalButtons,
    customConnectorButtons,
    connectorVisibilityMap,
    deviceDetails,
    buttonRadius = "pill",
    chainNamespace,
    onBackClick,
    handleExternalWalletClick,
    handleWalletDetailsHeight,
  } = props;

  const { bodyState, setBodyState } = useContext(RootContext);
  const { analytics } = useContext(AnalyticsContext);

  const [currentPage, setCurrentPage] = useState(CONNECT_WALLET_PAGES.CONNECT_WALLET);
  const [selectedWallet, setSelectedWallet] = useState(false);
  const [isLoading] = useState<boolean>(false);
  const [selectedButton, setSelectedButton] = useState<ExternalButton>(null);
  const [walletSearch, setWalletSearch] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<string>("all");
  const [isShowAllWallets, setIsShowAllWallets] = useState<boolean>(false);

  const handleBack = () => {
    if (!selectedWallet && currentPage === CONNECT_WALLET_PAGES.CONNECT_WALLET && onBackClick) {
      onBackClick(false);
      return;
    }

    if (selectedWallet) {
      setCurrentPage(CONNECT_WALLET_PAGES.CONNECT_WALLET);
      setSelectedWallet(false);
      handleWalletDetailsHeight();
    }
  };

  const walletDiscoverySupported = useMemo(() => {
    const supported = walletRegistry && Object.keys(walletRegistry.default || {}).length > 0 && Object.keys(walletRegistry.others || {}).length > 0;
    return supported;
  }, [walletRegistry]);

  const allUniqueButtons = useMemo(() => {
    const uniqueButtonSet = new Set();
    return customConnectorButtons.concat(allExternalButtons).filter((button) => {
      if (uniqueButtonSet.has(button.name)) return false;
      uniqueButtonSet.add(button.name);
      return true;
    });
  }, [allExternalButtons, customConnectorButtons]);

  const defaultButtonKeys = useMemo(() => new Set(Object.keys(walletRegistry.default)), [walletRegistry]);

  const defaultButtons = useMemo(() => {
    // display order: default injected buttons > custom adapter buttons > default non-injected buttons
    const buttons = [
      ...allExternalButtons.filter((button) => button.hasInjectedWallet && defaultButtonKeys.has(button.name)),
      ...customConnectorButtons,
      ...allExternalButtons.filter((button) => !button.hasInjectedWallet && defaultButtonKeys.has(button.name)),
    ].sort((a, b) => {
      // favor MetaMask over other wallets
      if (a.name === WALLET_CONNECTORS.METAMASK && b.name === WALLET_CONNECTORS.METAMASK) {
        // favor injected MetaMask over non-injected MetaMask
        if (a.hasInjectedWallet) return -1;
        if (b.hasInjectedWallet) return 1;
        // favor installed MetaMask over non-installed MetaMask
        if (a.isInstalled) return -1;
        if (b.isInstalled) return 1;
        return 0;
      }
      if (a.name === WALLET_CONNECTORS.METAMASK) return -1;
      if (b.name === WALLET_CONNECTORS.METAMASK) return 1;
      return 0;
    });

    const buttonSet = new Set();
    return buttons
      .filter((button) => {
        if (buttonSet.has(button.name)) return false;
        buttonSet.add(button.name);
        return true;
      })
      .filter((button) => selectedChain === "all" || button.chainNamespaces?.includes(selectedChain as ChainNamespaceType));
  }, [allExternalButtons, customConnectorButtons, defaultButtonKeys, selectedChain]);

  const installedWalletButtons = useMemo(() => {
    const visibilityMap = connectorVisibilityMap;
    return Object.keys(config).reduce((acc, localConnector) => {
      if (localConnector !== WALLET_CONNECTORS.WALLET_CONNECT_V2 && visibilityMap[localConnector]) {
        acc.push({
          name: localConnector,
          displayName: config[localConnector as WALLET_CONNECTOR_TYPE].label || localConnector,
          hasInjectedWallet: config[localConnector as WALLET_CONNECTOR_TYPE].isInjected,
          hasWalletConnect: false,
          hasInstallLinks: false,
        });
      }
      return acc;
    }, [] as ExternalButton[]);
  }, [connectorVisibilityMap, config]);

  const handleWalletSearch = (e: FormEvent<HTMLInputElement>) => {
    const searchValue = (e.target as HTMLInputElement).value;
    setWalletSearch(searchValue);
  };

  const handleChainFilterChange = (chain: string) => {
    setSelectedChain(chain);
    setIsShowAllWallets(false);
  };

  const filteredButtons = useMemo(() => {
    if (walletDiscoverySupported) {
      return [...allUniqueButtons.filter((button) => button.hasInjectedWallet), ...allUniqueButtons.filter((button) => !button.hasInjectedWallet)]
        .sort((a, _) => (a.name === WALLET_CONNECTORS.METAMASK ? -1 : 1))
        .filter((button) => selectedChain === "all" || button.chainNamespaces.includes(selectedChain as ChainNamespaceType))
        .filter((button) => button.name.toLowerCase().includes(walletSearch.toLowerCase()));
    }
    return installedWalletButtons;
  }, [walletDiscoverySupported, installedWalletButtons, walletSearch, allUniqueButtons, selectedChain]);

  const externalButtons = useMemo(() => {
    if (walletDiscoverySupported && !walletSearch && !isShowAllWallets) {
      return defaultButtons;
    }
    return filteredButtons;
  }, [walletDiscoverySupported, walletSearch, filteredButtons, defaultButtons, isShowAllWallets]);

  const totalExternalWalletsCount = useMemo(() => filteredButtons.length, [filteredButtons]);

  const initialWalletCount = useMemo(() => {
    if (isShowAllWallets) return totalExternalWalletsCount;
    return walletDiscoverySupported ? defaultButtons.length : installedWalletButtons.length;
  }, [walletDiscoverySupported, defaultButtons, installedWalletButtons, isShowAllWallets, totalExternalWalletsCount]);

  const handleWalletClick = (button: ExternalButton) => {
    analytics?.track(ANALYTICS_EVENTS.EXTERNAL_WALLET_SELECTED, {
      connector: button.isInstalled ? button.name : button.hasWalletConnect ? WALLET_CONNECTORS.WALLET_CONNECT_V2 : "",
      wallet_name: button.displayName,
      is_installed: button.isInstalled,
      is_injected: button.hasInjectedWallet,
      chain_namespaces: button.chainNamespaces,
      has_wallet_connect: button.hasWalletConnect,
      has_install_links: button.hasInstallLinks,
      has_wallet_registry_item: !!button.walletRegistryItem,
      total_external_wallets: allUniqueButtons.length,
    });

    // show chain namespace selector if the button is an injected connector with multiple chain namespaces
    const isChainNamespaceSelectorRequired = button.hasInjectedWallet && button.chainNamespaces?.length > 1;
    if (isChainNamespaceSelectorRequired) {
      setBodyState({
        ...bodyState,
        multiChainSelector: {
          show: true,
          wallet: button,
        },
      });
      return;
    }

    // connect with connector if injected and single chain namespace or custom connector (except MetaMask)
    const isInjectedConnectorAndSingleChainNamespace = button.hasInjectedWallet && button.chainNamespaces?.length === 1;
    const isCustomConnector = !button.hasInjectedWallet && button.isInstalled;
    if (isInjectedConnectorAndSingleChainNamespace || (isCustomConnector && button.name !== WALLET_CONNECTORS.METAMASK)) {
      return handleExternalWalletClick({ connector: button.name });
    }

    // show QR code for wallet connect v2 and MM (non-injected)
    if (button.hasWalletConnect) {
      setSelectedButton(button);
      setSelectedWallet(true);
      setCurrentPage(CONNECT_WALLET_PAGES.SELECTED_WALLET);
      handleWalletDetailsHeight();
    } else {
      // show install links
      setBodyState({
        ...bodyState,
        installLinks: {
          show: true,
          wallet: button,
        },
      });
    }
  };

  const handleMoreWallets = () => {
    setIsShowAllWallets(true);
  };

  const qrCodeValue = useMemo(() => {
    if (!selectedWallet) return null;

    if (selectedButton.name === WALLET_CONNECTORS.METAMASK && !selectedButton.hasInjectedWallet) {
      return metamaskConnectUri;
    }
    return walletConnectUri;
  }, [metamaskConnectUri, selectedButton, selectedWallet, walletConnectUri]);

  return (
    <div className="w3a--relative w3a--flex w3a--flex-1 w3a--flex-col w3a--gap-y-4">
      {/* Header */}
      <ConnectWalletHeader onBackClick={handleBack} currentPage={currentPage} selectedButton={selectedButton} />
      {/* Body */}
      {selectedWallet ? (
        <ConnectWalletQrCode
          qrCodeValue={qrCodeValue}
          isDark={isDark}
          selectedButton={selectedButton}
          primaryColor={selectedButton.walletRegistryItem?.primaryColor}
          logoImage={`https://images.web3auth.io/login-${selectedButton.name}.${selectedButton.imgExtension}`}
        />
      ) : (
        <div className="w3a--flex w3a--flex-col w3a--gap-y-2">
          <ConnectWalletChainFilter
            isDark={isDark}
            isLoading={isLoading}
            selectedChain={selectedChain}
            setSelectedChain={handleChainFilterChange}
            chainNamespace={chainNamespace}
          />
          {/* Search Input */}
          <ConnectWalletSearch
            totalExternalWalletCount={totalExternalWalletsCount}
            isLoading={isLoading}
            walletSearch={walletSearch}
            handleWalletSearch={handleWalletSearch}
            buttonRadius={buttonRadius}
          />
          {/* Wallet List */}
          <ConnectWalletList
            externalButtons={externalButtons}
            isLoading={isLoading}
            totalExternalWalletsCount={totalExternalWalletsCount}
            initialWalletCount={initialWalletCount}
            handleWalletClick={handleWalletClick}
            handleMoreWallets={handleMoreWallets}
            isDark={isDark}
            deviceDetails={deviceDetails}
            walletConnectUri={walletConnectUri}
            buttonRadius={buttonRadius}
          />
        </div>
      )}
    </div>
  );
}

export default ConnectWallet;
