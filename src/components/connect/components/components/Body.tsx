import { motion } from 'framer-motion'
import styled, { css } from 'styled-components'
import type React from 'react'

const ProgramContainer = styled(motion.div)<{
  $float?: boolean
  $home?: boolean
  $banner?: boolean
}>`
  margin-top: 150px;
  padding-top: 12px;
  z-index: 1;
  flex: 1;
  padding-bottom: 28px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  position: relative;
  max-width: 800px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  ${({ $float, $home, $banner }) =>
    $float &&
    css`
            position: relative;
            top: ${$home ? 180 : 180}px;
            margin-top: 0px;
            z-index: 99;
            width: 100%;
            padding-top: 8px;
            ${
              $home
                ? `max-height: calc(100vh - ${$banner ? '214px' : '214px'});`
                : ''
            }
            }
        `}
`

const Container = styled(motion.div)<{ $float?: boolean; $home?: boolean }>`
  margin-top: 150px;
  padding-top: 12px;
  z-index: 1;
  flex: 1;
  padding-bottom: 28px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  ${({ $float, $home }) =>
    $float &&
    css`
            position: relative;
            top: ${$home ? 180 : 180}px;
            margin-top: -8px;
            z-index: 99;
            width: 100%;
            padding-top: 8px;
            ${$home ? `max-height: calc(100% - 214px);` : ''}
            }
        `}
`

type Props = {
  children: React.ReactNode | React.ReactNode[]
  $float?: boolean
  $home?: boolean
  $banner?: boolean
  pathname?: string
}

function Body({ children, $float, $home, $banner, pathname }: Props) {
  if (pathname?.includes('programme')) {
    return (
      <ProgramContainer
        $float={$float}
        $home={$home}
        $banner={$banner}
        // className='body'
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.3
          }
        }}
        exit={{
          opacity: 0,
          transition: {
            duration: 0.15
          }
        }}
      >
        {children}
      </ProgramContainer>
    )
  } else {
    return (
      <Container
        $float={$float}
        $home={$home}
        // className='body'
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.3
          }
        }}
        exit={{
          opacity: 0,
          transition: {
            duration: 0.15
          }
        }}
      >
        {children}
      </Container>
    )
  }
}

export default Body
