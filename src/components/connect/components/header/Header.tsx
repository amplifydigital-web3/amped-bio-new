import styled from 'styled-components'
import DetailNav from './DetailNav'

export const HeaderContainer = styled.header`
  display: flex;
  flex-direction: column;
  background: var(--npayme__brand-color);
  height: 120px;
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

const HeaderWelcome = styled.h2`
  font-size: 16px;
  font-weight: 500;
  color: var(--npayme__copy-color);
  transform: translateY(60%);
`

const HeaderTitle = styled.h1`
  font-weight: 700;
  font-size: 20px;
  line-height: 24px;
  color: var(--npayme__copy-color);
  margin-top: 32px;
`

const Subtitle = styled.p`
  margin-top: 16px;
  font-weight: 400;
  font-size: 12px;
  line-height: 15px;
  color: var(--npayme__copy-color);
`

type Props = {
  title: string
  subtitle?: string
  back?: () => void
}

function ProgrammeHeader({ title, subtitle, back }: Props) {
  return (
    <HeaderContainer>
      {!!back ? (
        <DetailNav back={back} />
      ) : (
        <HeaderWelcome>Welcome to</HeaderWelcome>
      )}
      <span>
        <HeaderTitle>{title}</HeaderTitle>
        {!!subtitle && <Subtitle>{subtitle}</Subtitle>}
      </span>
    </HeaderContainer>
  )
}

export default ProgrammeHeader
