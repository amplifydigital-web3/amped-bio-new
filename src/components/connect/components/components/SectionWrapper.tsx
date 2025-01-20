import { motion } from 'framer-motion'
import styled from 'styled-components'
import type React from 'react'

const Wrapper = styled(motion.section)<{ data?: boolean }>`
  display: flex;
  flex-direction: column;
  box-shadow: rgba(149, 157, 165, 0.2) 0px 8px 24px;
  background: var(--widget-card);
  border-radius: 8px;
  padding: ${({ data }) => (data ? '8px 4px' : '16px')};
  margin: 0px 16px 12px 16px;
  flex: 1;

  @media (min-width: 768px) {
    margin-left: 0;
    margin-right: 0;
  }
`

type Props = {
  children: React.ReactNode | React.ReactNode[]
  [key: string]: any
}

function ProgrammeSectionWrapper({ children, ...props }: Props) {
  return <Wrapper {...props}>{children}</Wrapper>
}

export default ProgrammeSectionWrapper
