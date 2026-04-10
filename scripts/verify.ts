import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadCourseFile, getPreferredMoodleBinary, listCourseFiles, listSemesters } from "../src/school-data";

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = process.argv[2] ? path.resolve(process.argv[2]) : "/Users/oli/school";
  const semesters = await listSemesters(root);
  if (!semesters.length) {
    throw new Error("No semesters found.");
  }
  const course =
    semesters.flatMap((semester) => semester.courses).find((entry) => entry.slug === "hpc") ||
    semesters.flatMap((semester) => semester.courses)[0];
  if (!course) {
    throw new Error("No course found.");
  }
  const sections = await listCourseFiles(getPreferredMoodleBinary(""), course);
  const resource = sections.flatMap((section) => section.resources)[0];
  if (!resource) {
    throw new Error(`No Moodle resource found for ${course.slug}.`);
  }
  const result = await downloadCourseFile(getPreferredMoodleBinary(""), course, resource);
  const refreshedSections = await listCourseFiles(getPreferredMoodleBinary(""), course);
  const refreshedResource = refreshedSections.flatMap((section) => section.resources).find((entry) => entry.id === resource.id) || null;
  console.log(
    JSON.stringify(
      {
        semesterCount: semesters.length,
        course: course.slug,
        resource: resource.name,
        outputDir: result.outputDir,
        savedFiles: result.savedFiles,
        detectedDownloadedPath: refreshedResource?.downloadedPath || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
