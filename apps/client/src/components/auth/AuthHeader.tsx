import { Link } from "react-router";
import logoSVG from "../../assets/AMPLIFY_FULL_K.svg";

interface AuthHeaderProps {
  title: string;
}

export function AuthHeader({ title }: AuthHeaderProps) {
  return (
    <>
      <div className="flex justify-center mb-6">
        <Link to="/">
          <img src={logoSVG} alt="Amplify Digital Logo" className="h-16" />
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-center text-gray-800">{title}</h1>
    </>
  );
}
