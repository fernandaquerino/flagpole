import { Workspace } from '../../../components/workspace';
export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Workspace>{children}</Workspace>;
}
