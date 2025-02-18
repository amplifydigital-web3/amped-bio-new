import styled, { css } from 'styled-components'

export const BaseButton = styled.button<{
  danger?: boolean
  colorPicker?: boolean
  disabled?: boolean
  onClick?: (() => Promise<void>) | (() => void)
}>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 2px solid var(--widget-contrast);
  cursor: pointer;
  overflow: hidden !important;
  background: transparent;
  width: fit-content;
  border-radius: ${({ colorPicker }) => (colorPicker ? 4 : 20)}px;
  padding: ${({ colorPicker }) => (colorPicker ? '12px' : '10px 30px')};
  color: var(--widget-contrast-low);
  font-size: 14px;
  font-weight: 600;
  div {
    font-size: 16px;
    line-height: 16px;
    color: var(--widget-contrast);
    font-weight: ${({ colorPicker }) => (colorPicker ? 400 : 700)};
  }

  ${({ danger }) =>
    danger &&
    css`
      background: #fff;
      border-color: var(--error);
      div {
        color: var(--error);
      }
      &:hover {
        background-color: var(--error);
        div {
          color: #fff;
        }
      }
    `}
`<any>

export const BrandedProgrammeButton = styled(BaseButton)<{
  background?: string
}>`
  background: ${({ background }) =>
    background || 'var(--npayme__brand-color)'};
  color: var(--npayme__copy-color);
  padding: 0.3rem 0.6rem;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  height: 40px;

  div {
    font-weight: 700;
    font-size: 14px;
    padding-right: 12px;
    color: #fff;
  }

  &:hover {
    color: var(--npayme__copy-color);
    background: ${({ background }) =>
      background || 'var(--npayme__brand-color)'};
    border: none;
  }

  &:disabled {
    opacity: 0.7;
    filter: grayscale(0.9);
    cursor: not-allowed;
  }
`
