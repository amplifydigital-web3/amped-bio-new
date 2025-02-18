import styled from 'styled-components'
import ArrowLeft from '../components/ArrowLeft'
import Spacer from '../components/Spacer'

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`<any>

const BackButton = styled.button<{ color?: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  // line-height: 15px;
  color: ${({ color }) => color || 'var(--npayme__copy-color)'};
`<any>

const Address = styled.p`
  font-weight: 600;
  font-size: 14px;
`

type Props = {
  back: () => void
  color?: string
  address?: string
}

function DetailNav({ back, color, address }: Props) {
  const addr = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : ''
  return (
    <Container color={color}>
      <BackButton onClick={back} color={color}>
        <ArrowLeft size={20} fill={color} />
        <Spacer size={12} horizontal="true" />
        Back
      </BackButton>
      <Address>{addr}</Address>
    </Container>
  )
}

export default DetailNav
