"use client";

import { useCallback } from "react";
import { AppKit } from "@reown/appkit";
import Modal from "./Modal";
import ProgrammeHeader from "../header/Header";
import { BaseLabel, Link } from "./DataDisplay";
import { BrandedProgrammeButton } from "./Buttons";
import { CreateWalletButton } from "../smartwallet/CreateWalletButton";
import Spacer from "./Spacer";
import SectionWrapper from "./SectionWrapper";
import Body from "./Body";
import { ErrorBoundary } from "react-error-boundary";

export type ConnectModalProps = {
  modal: AppKit;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export function ConnectModal(props: ConnectModalProps) {
  const { modal, open, setOpen } = props;

  const closeModal = useCallback(() => setOpen(false), []);

  const connectWeb3Wallet = useCallback(() => {
    if (modal) {
      closeModal();
      modal?.open();
    }
  }, [modal]);

  const handleSuccess = useCallback(
    (address: string) => {
      modal?.close();
      closeModal();

      // TODO: Investigate - setAddress should be good enough
      // setAddress(address);
      // window.location.reload();
    },
    [modal]
  );

  const handleError = useCallback((e: any) => {
    console.log(e);
  }, []);

  return (
    <Modal isOpen={open} close={closeModal}>
      <ProgrammeHeader title="Join & Sign In" back={closeModal} />
      <Body>
        <SectionWrapper>
          <BaseLabel>I'd like to join and I need a Web3 Wallet</BaseLabel>
          <Spacer size={8} />
          <ErrorBoundary fallback={<p>⚠️Something went wrong</p>}>
            <CreateWalletButton
              handleSuccess={handleSuccess}
              handleError={handleError}
            />
          </ErrorBoundary>
        </SectionWrapper>
        <SectionWrapper>
          <BaseLabel>I already have a Web3 Wallet</BaseLabel>
          <Spacer size={8} />
          <BrandedProgrammeButton onClick={connectWeb3Wallet}>
            Connect Web3 Wallet
          </BrandedProgrammeButton>
        </SectionWrapper>
        <SectionWrapper>
          <Link href={`https://ethereum.org/en/web3/`} target={"_blank"}>
            What's a Web3 Wallet and why do I need one?
          </Link>
        </SectionWrapper>
      </Body>
    </Modal>
  );
}
