import SwiftUI
import SwiftData

/// The Calendar tab: a month grid marking the days you have exams, with the selected day's exams (or
/// what's coming up) listed below. Tapping an exam opens its study hub.
struct CalendarView: View {
    @Query(filter: #Predicate<Subject> { $0.deletedAt == nil }, sort: \Subject.createdAt)
    private var subjects: [Subject]

    /// Any date within the displayed month.
    @State private var month: Date = .now
    @State private var selected: Date = Calendar.current.startOfDay(for: .now)

    private var cal: Calendar { Calendar.current }

    private var datedExams: [Exam] {
        subjects.flatMap { $0.activeExams }.filter { $0.examDate != nil }
    }
    private func exams(on day: Date) -> [Exam] {
        datedExams.filter { cal.isDate($0.examDate!, inSameDayAs: day) }
            .sorted { ($0.subject?.name ?? "") < ($1.subject?.name ?? "") }
    }
    private var upcoming: [Exam] {
        datedExams.filter { ($0.daysUntilExam ?? -1) >= 0 }.sorted { $0.examDate! < $1.examDate! }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    monthCard
                    listSection
                }
                .padding(Space.md)
            }
            .background(CanvasBackground())
            .navigationTitle("Calendar")
        }
    }

    // MARK: - Month grid

    private var monthCard: some View {
        Panel {
            VStack(spacing: Space.sm) {
                HStack {
                    Button { shiftMonth(-1) } label: { Image(systemName: "chevron.left").frame(width: 32, height: 32) }
                    Spacer()
                    Text(month.formatted(.dateTime.month(.wide).year()))
                        .font(.headline).foregroundStyle(Theme.ink)
                    Spacer()
                    Button { shiftMonth(1) } label: { Image(systemName: "chevron.right").frame(width: 32, height: 32) }
                }
                .foregroundStyle(Theme.brand)

                HStack(spacing: 4) {
                    ForEach(Array(weekdaySymbols.enumerated()), id: \.offset) { _, s in
                        Text(s).font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)
                    }
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 5) {
                    ForEach(Array(daysInGrid.enumerated()), id: \.offset) { _, day in
                        if let day { dayCell(day) } else { Color.clear.frame(height: 42) }
                    }
                }
            }
        }
    }

    private func dayCell(_ day: Date) -> some View {
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let isToday = cal.isDateInToday(day)
        let hasExam = !exams(on: day).isEmpty
        return Button { selected = day } label: {
            VStack(spacing: 3) {
                Text("\(cal.component(.day, from: day))")
                    .font(.subheadline.weight(isToday || isSelected ? .bold : .regular))
                    .foregroundStyle(isSelected ? Theme.onBrand : (isToday ? Theme.brand : Theme.ink))
                Circle()
                    .fill(hasExam ? (isSelected ? Color.white : Theme.brand) : Color.clear)
                    .frame(width: 5, height: 5)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Theme.brandGradient)
                } else if isToday {
                    RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Theme.brandRing, lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var listSection: some View {
        let onDay = exams(on: selected)
        return VStack(alignment: .leading, spacing: Space.sm) {
            if !onDay.isEmpty {
                SectionHeader(title: selected.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                ForEach(onDay) { examRow($0) }
            } else {
                SectionHeader(title: "Upcoming")
                if upcoming.isEmpty {
                    Panel {
                        Text("No exams scheduled. Give your exams a date and they'll show up here.")
                            .font(.subheadline).foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    ForEach(upcoming.prefix(10)) { examRow($0) }
                }
            }
        }
    }

    @ViewBuilder
    private func examRow(_ exam: Exam) -> some View {
        if let subject = exam.subject, let date = exam.examDate {
            NavigationLink {
                ExamView(scope: StudyScope(subject: subject, exam: exam))
            } label: {
                Panel(padding: Space.sm) {
                    HStack(spacing: Space.sm) {
                        MonogramTile(subject: subject, size: 40)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(exam.title).font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.ink).lineLimit(1)
                            Text(subject.name).font(.caption).foregroundStyle(Theme.ink2)
                        }
                        Spacer(minLength: Space.xs)
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(date.formatted(.dateTime.day().month()))
                                .font(.caption.weight(.semibold)).foregroundStyle(Theme.ink2)
                            if let d = exam.daysUntilExam {
                                Text(d == 0 ? "today" : d > 0 ? "in \(d)d" : "past")
                                    .font(.figure(.caption2, .semibold))
                                    .foregroundStyle(d >= 0 && d <= 7 ? Theme.danger : Theme.muted)
                            }
                        }
                    }
                }
            }
            .buttonStyle(PressableCardStyle())
        }
    }

    // MARK: - Date helpers

    private func shiftMonth(_ n: Int) {
        if let m = cal.date(byAdding: .month, value: n, to: month) { month = m }
    }

    private var weekdaySymbols: [String] {
        let symbols = cal.veryShortWeekdaySymbols
        let shift = cal.firstWeekday - 1
        return Array(symbols[shift...] + symbols[..<shift])
    }

    private var daysInGrid: [Date?] {
        guard let interval = cal.dateInterval(of: .month, for: month),
              let daysInMonth = cal.range(of: .day, in: .month, for: interval.start)?.count else { return [] }
        let start = interval.start
        let firstWeekday = cal.component(.weekday, from: start)
        let leading = (firstWeekday - cal.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for d in 0..<daysInMonth { cells.append(cal.date(byAdding: .day, value: d, to: start)) }
        while cells.count % 7 != 0 { cells.append(nil) }
        return cells
    }
}

#Preview {
    CalendarView()
        .modelContainer(PreviewData.container)
}
