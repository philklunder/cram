import SwiftUI
import SwiftData

/// The home surface, deliberately spare: a greeting, the **one** exam to study next with a single
/// Study button, and a short list of what's coming after it. One glance, one action.
struct TodayView: View {
    @Environment(AuthManager.self) private var auth
    @Query(filter: #Predicate<Subject> { $0.deletedAt == nil }, sort: \Subject.createdAt)
    private var subjects: [Subject]
    @Query(sort: \ReviewLog.date, order: .reverse) private var reviewLogs: [ReviewLog]
    @State private var showingProfile = false

    // MARK: - Stats

    /// Total cards due for review right now across every subject.
    private var dueTotal: Int { subjects.reduce(0) { $0 + $1.dueCount } }

    /// Overall recall mastery (0…1) across subjects, or nil when nothing is measured.
    private var mastery: Double? {
        let m = subjects.compactMap(\.readiness)
        return m.isEmpty ? nil : m.reduce(0, +) / Double(m.count)
    }

    /// Cards reviewed today.
    private var reviewedToday: Int {
        reviewLogs.filter { Calendar.current.isDateInToday($0.date) }.count
    }

    /// Consecutive days (ending today, or yesterday if today isn't done yet) with at least one review.
    private var studyStreak: Int {
        let cal = Calendar.current
        let days = Set(reviewLogs.map { cal.startOfDay(for: $0.date) })
        guard !days.isEmpty else { return 0 }
        var day = cal.startOfDay(for: .now)
        if !days.contains(day) {
            day = cal.date(byAdding: .day, value: -1, to: day) ?? day
            if !days.contains(day) { return 0 }
        }
        var count = 0
        while days.contains(day) {
            count += 1
            guard let prev = cal.date(byAdding: .day, value: -1, to: day) else { break }
            day = prev
        }
        return count
    }

    /// All upcoming exams across subjects, soonest first.
    private var upcoming: [Exam] {
        subjects.flatMap { $0.upcomingExams }
            .sorted { ($0.examDate ?? .distantFuture) < ($1.examDate ?? .distantFuture) }
    }
    /// The exam to lead with: the soonest upcoming one, else any deck with cards due.
    private var heroExam: Exam? {
        upcoming.first
            ?? subjects.flatMap { $0.activeExams }.first { exam in
                guard let subject = exam.subject else { return false }
                return !StudyScope(subject: subject, exam: exam).dueCards.isEmpty
            }
    }
    private var heroScope: StudyScope? {
        heroExam.flatMap { exam in exam.subject.map { StudyScope(subject: $0, exam: exam) } }
    }
    private var rest: [Exam] { upcoming.filter { $0.id != heroExam?.id } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    Text(greeting)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.ink2)
                        .padding(.top, Space.xs)

                    if !subjects.isEmpty { statsGrid }

                    if let scope = heroScope {
                        hero(scope)
                        if !rest.isEmpty { upcomingSection }
                    } else {
                        emptyHero
                    }
                }
                .padding(Space.md)
            }
            .background(CanvasBackground())
            .navigationTitle("Today")
            .toolbarTitleDisplayMode(.inlineLarge)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingProfile = true } label: {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title2)
                            .foregroundStyle(Theme.brand)
                    }
                    .accessibilityLabel("Profile")
                }
            }
            .sheet(isPresented: $showingProfile) { ProfileView() }
        }
    }

    // MARK: - Stats grid

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.xs),
                            GridItem(.flexible(), spacing: Space.xs)], spacing: Space.xs) {
            StatTile(value: "\(studyStreak)",
                     label: studyStreak == 1 ? "day streak" : "day streak",
                     systemImage: "flame.fill",
                     tone: studyStreak > 0 ? Theme.brand : Theme.muted)
            StatTile(value: "\(dueTotal)",
                     label: dueTotal == 1 ? "card due" : "cards due",
                     systemImage: "rectangle.stack.fill",
                     tone: dueTotal > 0 ? Theme.brand : Theme.ink)
            StatTile(value: mastery.map { "\(Int(($0 * 100).rounded()))%" } ?? "—",
                     label: "mastery",
                     systemImage: "brain.head.profile",
                     tone: ReadinessVerdict.of(mastery).color)
            StatTile(value: "\(reviewedToday)",
                     label: "reviewed today",
                     systemImage: "checkmark.seal.fill",
                     tone: reviewedToday > 0 ? Theme.success : Theme.ink)
        }
    }

    // MARK: - Hero

    private func hero(_ scope: StudyScope) -> some View {
        GradientHeroCard(padding: Space.lg) {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack(spacing: Space.sm) {
                    MonogramTile(subject: scope.subject, size: 46)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scope.subject.name.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.6)
                            .foregroundStyle(.white.opacity(0.85))
                        Text(scope.title)
                            .font(.serifDisplay(.title2, .semibold)).foregroundStyle(.white)
                    }
                    Spacer()
                }

                if let exam = scope.exam, let pill = countdownText(exam.daysUntilExam) {
                    HeroPill(text: pill, systemImage: "calendar")
                }

                Text(workloadLine(scope))
                    .font(.subheadline).foregroundStyle(.white.opacity(0.9))

                NavigationLink { ExamView(scope: scope) } label: {
                    HStack(spacing: Space.xs) {
                        Image(systemName: "play.fill")
                        Text(scope.dueCards.isEmpty ? "Study" : "Study \(scope.dueCards.count) due card\(scope.dueCards.count == 1 ? "" : "s")")
                    }
                }
                .buttonStyle(OnGradientButtonStyle())
            }
        }
    }

    /// Countdown copy for the hero pill; `nil` hides the pill when there's no exam date.
    private func countdownText(_ days: Int?) -> String? {
        guard let days else { return nil }
        if days < 0 { return "Exam passed" }
        if days == 0 { return "Exam today" }
        return "\(days) day\(days == 1 ? "" : "s") to exam"
    }

    private func workloadLine(_ scope: StudyScope) -> String {
        if scope.cards.isEmpty { return "No cards yet — add material to this exam to start." }
        if scope.dueCards.isEmpty { return "You're ahead — nothing due, but you can review anytime." }
        return "\(scope.dueCards.count) card\(scope.dueCards.count == 1 ? "" : "s") ready to review now."
    }

    @ViewBuilder private var emptyHero: some View {
        if subjects.isEmpty {
            VStack(spacing: Space.md) {
                AppLogoMark(size: 84)
                VStack(spacing: 6) {
                    Text("Welcome to Cram")
                        .font(.serifDisplay(.title, .semibold)).foregroundStyle(Theme.ink)
                    Text("Add a subject in the Subjects tab, give it an exam, and add material — Cram turns it into flashcards and quizzes to study.")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: 360)
            .frame(maxWidth: .infinity)
            .padding(.top, Space.xl)
        } else {
            EmptyStateView(
                title: "No exams scheduled",
                message: "Add an exam to one of your subjects to see what to study next.",
                systemImage: "calendar.badge.plus")
            .frame(maxWidth: .infinity)
            .padding(.top, Space.xxl)
        }
    }

    // MARK: - Upcoming

    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Upcoming")
            VStack(spacing: Space.xs) {
                ForEach(rest.prefix(4)) { exam in
                    if let subject = exam.subject {
                        NavigationLink {
                            ExamView(scope: StudyScope(subject: subject, exam: exam))
                        } label: {
                            UpcomingRow(subject: subject, exam: exam)
                        }
                        .buttonStyle(PressableCardStyle())
                    }
                }
            }
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        if case let .signedIn(email) = auth.state, let name = email?.split(separator: "@").first {
            return "\(part), \(name.capitalized)"
        }
        return part
    }
}

private struct UpcomingRow: View {
    let subject: Subject
    let exam: Exam

    var body: some View {
        HStack(spacing: Space.sm) {
            MonogramTile(subject: subject, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(exam.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(subject.name).font(.caption).foregroundStyle(Theme.ink2)
            }
            Spacer()
            if let days = exam.daysUntilExam {
                Text(days == 0 ? "today" : "\(days)d")
                    .font(.figure(.caption, .semibold))
                    .foregroundStyle(days <= 7 ? Theme.danger : Theme.ink2)
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .padding(Space.sm)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }
}

#Preview {
    TodayView()
        .modelContainer(PreviewData.container)
        .environment(AuthManager.shared)
}
