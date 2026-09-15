import Link from "next/link";
import Image from "next/image";

interface AuthHeaderProps {
  title: string;
}

export function AuthHeader({ title }: AuthHeaderProps) {
  return (
    <>
      <div className="flex justify-center mb-6">
        <Link href="/">
          <Image src="/logo.svg" alt="Amplify Digital Logo" width={0} height={0} className="h-16 w-auto" priority />
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-center text-gray-800">{title}</h1>
    </>
  );
}
