import { motion } from 'framer-motion';
import { Cross } from 'lucide-react';
import React from 'react';
import styled from 'styled-components';

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
`;

const Container = styled(motion.div)`
  position: relative;
  max-width: var(--max-width);
  // width: 100%;
  max-height: 80vh;
  margin: auto;
  background-color: var(--bg);
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow-y: hidden;
  overflow-x: hidden;
  border: 2px solid var(--button-base);
`;

const CloseIcon = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  cursor: pointer;
`<any>;

type Props = {
  children: React.ReactNode | React.ReactNode[];
  isOpen: boolean;
  close?: any;
};

function Modal({ children, isOpen, close }: Props) {
  return (
    <>
      {isOpen && (
        <Backdrop>
          <Container
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
            {!!close && (
              <CloseIcon onClick={close}>
                <Cross size={32} />
              </CloseIcon>
            )}
          </Container>
        </Backdrop>
      )}
    </>
  );
}

export default Modal;
