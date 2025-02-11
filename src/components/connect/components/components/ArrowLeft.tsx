type Props = {
  fill?: string
  size?: number
}

const ArrowLeft = ({ fill, size }: Props) => (
  <svg
    width={size || 24}
    height={size || 24}
    viewBox='0 0 24 24'
    fill={'#00000000'}
    xmlns='http://www.w3.org/2000/svg'
  >
    <path
      d='M19 12H5M5 12L12 19M5 12L12 5'
      stroke={fill || 'var(--npayme__copy-color)'}
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
)

export default ArrowLeft
