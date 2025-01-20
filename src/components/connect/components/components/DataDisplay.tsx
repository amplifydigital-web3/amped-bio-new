import styled from 'styled-components'
import type React from 'react'

export const Link = styled.a`
  font-weight: 400;
  font-size: 10px;
  line-height: 12px;
  margin-bottom: 4px;
  color: var(--widget-contrast-high);
`<any>

export const BaseLabel = styled.div`
  font-weight: 400;
  font-size: 10px;
  line-height: 12px;
  margin-bottom: 4px;
  color: var(--widget-contrast-high);
`<any>

export const Label = styled.div`
  font-weight: 400;
  font-size: 10px;
  line-height: 12px;
  text-transform: uppercase;
  margin-bottom: 4px;
  color: var(--widget-contrast-high);
`<any>

const Data = styled.p`
  font-weight: 600;
  font-size: 12px;
  line-height: 15px;
  overflow-wrap: break-word;
  max-width: 100%;
  color: var(--widget-contrast-high);
`<any>

// type Props = {
//   label: string;
//   data: string | React.ReactNode;
//   style?: { label: React.CSSProperties; data: React.CSSProperties };
// };

function DataDisplay({ label, data, style }: {
  label: string;
  data: string | React.ReactNode;
  style?: { label: React.CSSProperties; data: React.CSSProperties };
}) {
  return (
    <div>
      <Label style={style?.label}>{label}</Label>
      <Data style={style?.data}>
        {data === '0x0' ? 'Native Currency' : data}
      </Data>
    </div>
  )
}

export default DataDisplay
