import styled from 'styled-components'
import Spacer from '../components/Spacer'
// import Image from "next/image";

export const HeaderContainer = styled.header`
  display: flex;
  flex-direction: column;
  background: var(--npayme__brand-color);
  background: linear-gradient(
    0deg,
    var(--widget-contrast) 0%,
    var(--npayme__brand-color) 62.33%
  );
  height: 170px;
  padding: 16px 20px;
  box-shadow: rgba(149, 157, 165, 0.2) 0px 8px 24px;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 99;
  color: var(--npayme__copy-color);
  > span {
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    align-items: flex-start;
    justify-content: flex-start;
  }
`

const Subtitle = styled.p`
  margin-top: 24px;
  font-weight: 600;
  font-size: 20px;
  color: var(--npayme__copy-color);
  opacity: 0.7;
`

const HeaderTitle = styled.h1`
  font-weight: 700;
  font-size: 20px;
  line-height: 24px;
  color: var(--npayme__copy-color);
  margin-top: 8px;
`

type Props = {
  business: any
}

function HomeHeader({ business }: Props) {
  return (
    <HeaderContainer>
      <span>
        {!!business.imageURI?.trim() ? (
          <div>
            <img
              src={business.imageURI.trim()}
              loading='lazy'
              alt={`${business.name}'s logo`}
              height={32}
              style={{ height: 32, width: 'auto', marginTop: 8 }}
            />
          </div>
        ) : (
          <Spacer size={40} />
        )}
        <Subtitle>Get ready to win.</Subtitle>
        <HeaderTitle>{business.programName}</HeaderTitle>
      </span>
    </HeaderContainer>
  )
}

export default HomeHeader
